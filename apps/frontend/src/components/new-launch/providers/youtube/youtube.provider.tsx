'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { YoutubeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { MediumTags } from '@gitroom/frontend/components/new-launch/providers/medium/medium.tags';
import { useWatch } from 'react-hook-form';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Select } from '@gitroom/react/form/select';
import { YoutubePreview } from '@gitroom/frontend/components/new-launch/providers/youtube/youtube.preview';
const type = [
  {
    label: 'Public',
    value: 'public',
  },
  {
    label: 'Private',
    value: 'private',
  },
  {
    label: 'Unlisted',
    value: 'unlisted',
  },
];

const madeForKids = [
  {
    label: 'No',
    value: 'no',
  },
  {
    label: 'Yes',
    value: 'yes',
  },
];

const languages = [
  { label: 'Russian', value: 'ru' },
  { label: 'English', value: 'en' },
  { label: 'Ukrainian', value: 'uk' },
  { label: 'German', value: 'de' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
];

// the categories YouTube lets a video be assigned to
const categories = [
  { label: 'Film & Animation', value: '1' },
  { label: 'Autos & Vehicles', value: '2' },
  { label: 'Music', value: '10' },
  { label: 'Pets & Animals', value: '15' },
  { label: 'Sports', value: '17' },
  { label: 'Travel & Events', value: '19' },
  { label: 'Gaming', value: '20' },
  { label: 'People & Blogs', value: '22' },
  { label: 'Comedy', value: '23' },
  { label: 'Entertainment', value: '24' },
  { label: 'News & Politics', value: '25' },
  { label: 'Howto & Style', value: '26' },
  { label: 'Education', value: '27' },
  { label: 'Science & Technology', value: '28' },
  { label: 'Nonprofits & Activism', value: '29' },
];
const YoutubeSettings: FC = () => {
  const t = useT();
  const { register, control, setValue } = useSettings();
  // the thumbnail is set from the media settings now, older posts may still
  // carry one here, and it wins over the media thumbnail
  const thumbnail = useWatch({ control, name: 'thumbnail' });
  return (
    <div className="flex flex-col">
      <Input label="Title" {...register('title')} maxLength={100} />
      <Select
        label="Type"
        {...register('type', {
          value: 'public',
        })}
      >
        {type.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Select
        label="Made for kids"
        {...register('selfDeclaredMadeForKids', {
          value: 'no',
        })}
      >
        {madeForKids.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Select
        label="Language"
        {...register('language', {
          value: 'ru',
        })}
      >
        {languages.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Select
        label="Category"
        {...register('categoryId', {
          value: '27',
        })}
      >
        {categories.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <MediumTags label="Tags" {...register('tags')} />
      {!!thumbnail?.path && (
        <div className="mt-[20px] flex items-center gap-[10px] text-[12px]">
          <div className="flex-1">
            {t(
              'youtube_thumbnail_overrides_media',
              'This post has a YouTube-specific thumbnail, which overrides the thumbnail set in the media settings.'
            )}
          </div>
          <div
            onClick={() =>
              setValue('thumbnail', undefined, { shouldDirty: true })
            }
            className="cursor-pointer text-[#FF3F3F] font-[600]"
          >
            {t('remove', 'Remove')}
          </div>
        </div>
      )}
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  comments: false,
  minimumCharacters: [],
  SettingsComponent: YoutubeSettings,
  CustomPreviewComponent: YoutubePreview,
  dto: YoutubeSettingsDto,
  maximumCharacters: 5000,
});
