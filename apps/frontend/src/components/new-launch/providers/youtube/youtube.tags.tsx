'use client';

import { ClipboardEvent, FC, useCallback, useMemo, useState } from 'react';
import { ReactTags } from 'react-tag-autocomplete';
import { useWatch } from 'react-hook-form';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import {
  getYoutubeTagsLength,
  YOUTUBE_TAGS_MAX_LENGTH,
} from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';

type Tag = { value: string; label: string };
type TagStats = {
  tag: string;
  searchRank: number;
  autocomplete: string[];
  medianViews: number;
  topCount: number;
  topUsing: number;
  topTags: string[];
};

// "tag1, tag2, big tag 3" -> ['tag1', 'tag2', 'big tag 3']
const splitTags = (text: string) =>
  text
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter(Boolean);

const searchLevel = (stats: TagStats) => {
  if (stats.searchRank > -1 && stats.searchRank < 3) {
    return { label: 'High', className: 'text-[#32D583]' };
  }
  if (stats.searchRank > -1) {
    return { label: 'Medium', className: 'text-[#FDB022]' };
  }
  if (stats.autocomplete.length) {
    return { label: 'Low', className: 'text-[#FF8A3F]' };
  }
  return { label: 'None', className: 'text-[#FF3F3F]' };
};

const compact = new Intl.NumberFormat('en', { notation: 'compact' });

export const YoutubeTags: FC<{
  name: string;
  label: string;
  onChange: (event: { target: { value: Tag[]; name: string } }) => void;
}> = (props) => {
  const { onChange, name, label } = props;
  const { getValues, control } = useSettings();
  const language = useWatch({ control, name: 'language' });
  const customFunc = useCustomProviderFunction();
  const toaster = useToaster();
  const t = useT();
  const [tagValue, setTagValue] = useState<Tag[]>(
    () => getValues()[name] || []
  );
  const [input, setInput] = useState('');
  // keyed by tag, so analyzing again only spends quota on new tags
  const [stats, setStats] = useState<Record<string, TagStats>>({});
  const [loading, setLoading] = useState(false);

  const update = useCallback(
    (modify: Tag[]) => {
      setTagValue(modify);
      onChange({ target: { value: modify, name } });
    },
    [name, onChange]
  );

  const addTags = useCallback(
    (labels: string[]) => {
      const existing = new Set(tagValue.map((p) => p.label.toLowerCase()));
      const added = labels.filter((p) => {
        const key = p.toLowerCase();
        if (existing.has(key)) {
          return false;
        }
        existing.add(key);
        return true;
      });
      if (added.length) {
        update([...tagValue, ...added.map((p) => ({ value: p, label: p }))]);
      }
    },
    [tagValue, update]
  );

  const onPaste = useCallback(
    (e: ClipboardEvent) => {
      const text = e.clipboardData.getData('text');
      if (!/[,\n]/.test(text)) {
        return;
      }
      e.preventDefault();
      addTags(splitTags(text));
    },
    [addTags]
  );

  const analyze = useCallback(async () => {
    const missing = tagValue
      .map((p) => p.label)
      .filter((p) => !stats[p.toLowerCase()]);
    if (!missing.length) {
      return;
    }
    setLoading(true);
    try {
      const data: TagStats[] | false = await customFunc.get('tagStats', {
        tags: missing,
        language,
      });
      if (!Array.isArray(data)) {
        throw new Error();
      }
      setStats((prev) => ({
        ...prev,
        ...Object.fromEntries(data.map((p) => [p.tag.toLowerCase(), p])),
      }));
    } catch {
      toaster.show(
        t(
          'youtube_tag_stats_failed',
          'Could not load tag stats, the daily YouTube search quota may be used up'
        ),
        'warning'
      );
    } finally {
      setLoading(false);
    }
  }, [tagValue, stats, language, customFunc]);

  // what the top-ranking videos and autocomplete use, most frequent first
  const related = useMemo(() => {
    const current = new Set(tagValue.map((p) => p.label.toLowerCase()));
    const counts = new Map<string, { label: string; count: number }>();
    for (const tag of tagValue) {
      const item = stats[tag.label.toLowerCase()];
      for (const p of [...(item?.topTags || []), ...(item?.autocomplete || [])]) {
        const key = p.toLowerCase();
        if (current.has(key)) {
          continue;
        }
        const found = counts.get(key) || { label: p, count: 0 };
        found.count++;
        counts.set(key, found);
      }
    }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [tagValue, stats]);

  const length = getYoutubeTagsLength(tagValue);
  const analyzed = tagValue.filter((p) => stats[p.label.toLowerCase()]);

  return (
    <div className="medium-tags" onPaste={onPaste}>
      <div className="flex justify-between text-[14px] mb-[6px]">
        <div>{label}</div>
        <div
          className={
            length > YOUTUBE_TAGS_MAX_LENGTH ? 'text-[#FF3F3F]' : 'opacity-60'
          }
        >
          {length}/{YOUTUBE_TAGS_MAX_LENGTH}
        </div>
      </div>
      <ReactTags
        placeholderText={t(
          'add_tags_comma_separated',
          'Add tags, separated by commas'
        )}
        // a value no selected tag has, or ReactTags would toggle a duplicate off
        suggestions={input ? [{ value: `new:${input}`, label: input }] : []}
        selected={tagValue}
        delimiterKeys={['Enter', ',']}
        onAdd={(tag) => addTags(splitTags(String(tag.label)))}
        onInput={setInput}
        onDelete={(index) => update(tagValue.filter((_, i) => i !== index))}
      />
      <div className="flex gap-[10px] mt-[8px]">
        <Button
          secondary={true}
          loading={loading}
          disabled={!tagValue.length}
          onClick={analyze}
        >
          {t('analyze_tags', 'Analyze tags')}
        </Button>
        {!!tagValue.length && (
          <Button secondary={true} onClick={() => update([])}>
            {t('clear', 'Clear')}
          </Button>
        )}
      </div>
      {!!analyzed.length && (
        <table className="w-full mt-[12px] text-[12px] text-start">
          <thead className="opacity-60">
            <tr>
              <th className="text-start">{t('tag', 'Tag')}</th>
              <th className="text-start">{t('searched', 'Searched')}</th>
              <th className="text-start">
                {t('top_median_views', 'Top-10 median views')}
              </th>
              <th className="text-start">
                {t('used_by_top', 'Used by top videos')}
              </th>
            </tr>
          </thead>
          <tbody>
            {analyzed.map((p) => {
              const item = stats[p.label.toLowerCase()];
              const level = searchLevel(item);
              return (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className={level.className}>{level.label}</td>
                  <td>{compact.format(item.medianViews)}</td>
                  <td>
                    {item.topUsing}/{item.topCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {!!related.length && (
        <div className="mt-[12px]">
          <div className="text-[12px] opacity-60 mb-[6px]">
            {t(
              'related_tags',
              'Used by top videos and searched on YouTube, click to add'
            )}
          </div>
          <div className="flex flex-wrap gap-[6px]">
            {related.map((p) => (
              <div
                key={p.label}
                onClick={() => addTags([p.label])}
                className="cursor-pointer text-[12px] px-[8px] py-[2px] rounded-[4px] bg-third"
              >
                + {p.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
