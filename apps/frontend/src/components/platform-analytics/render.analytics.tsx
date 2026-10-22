import { FC, useCallback, useState } from 'react';
import { Integration } from '@prisma/client';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { ChartSocial } from '@gitroom/frontend/components/analytics/chart-social';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export interface AnalyticsDataItem {
  label: string;
  data: Array<{ total: number | string; date: string }>;
  average?: boolean;
  format?: 'percent' | 'duration';
  total?: number;
  top?: Array<{ title: string; url?: string; total: number }>;
  percentageChange?: number;
  group?: string;
}

const formatValue = (value: number, format?: AnalyticsDataItem['format']) => {
  if (format === 'duration') {
    const seconds = Math.round(value);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  if (format === 'percent') {
    return value.toFixed(1) + '%';
  }

  return new Intl.NumberFormat().format(Math.round(value));
};

const formatTotal = (item: AnalyticsDataItem) => {
  const sum = item.data.reduce((acc, curr) => acc + Number(curr.total || 0), 0);
  const value =
    item.total ?? (item.average ? sum / (item.data.length || 1) : sum);

  return formatValue(value, item.format || (item.average ? 'percent' : undefined));
};

const TrendIndicator: FC<{ value: number; average?: boolean }> = ({
  value,
  average,
}) => {
  if (value === 0) return null;

  const isPositive = value > 0;
  const displayValue = Math.abs(value).toFixed(1);

  return (
    <div
      className={`flex items-center gap-[4px] text-[13px] font-medium ${
        isPositive ? 'text-[#32d583]' : 'text-[#f97066]'
      }`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className={isPositive ? '' : 'rotate-180'}
      >
        <path
          d="M6 2.5L10 7.5H2L6 2.5Z"
          fill="currentColor"
        />
      </svg>
      <span>
        {displayValue}
        {average ? 'pp' : '%'}
      </span>
    </div>
  );
};

const cardClass =
  'flex flex-col bg-newTableHeader border border-newTableBorder rounded-[12px] overflow-hidden';

// a lone number: no chart, a single point draws a flat line that says nothing
const StatTile: FC<{ item: AnalyticsDataItem }> = ({ item }) => (
  <div className={`${cardClass} gap-[6px] px-[16px] py-[14px]`}>
    <span className="text-[13px] text-newTableText truncate" title={item.label}>
      {item.label}
    </span>
    <span className="text-[26px] leading-[32px] font-semibold tracking-tight">
      {formatTotal(item)}
    </span>
  </div>
);

const ChartCard: FC<{ item: AnalyticsDataItem; index: number }> = ({
  item,
  index,
}) => {
  const colorVariants = ['purple', 'green', 'blue'] as const;
  const color = colorVariants[index % colorVariants.length];

  return (
    <div className={`${cardClass} hover:border-[#612bd3]/50 transition-colors`}>
      <div className="flex items-start justify-between gap-[12px] px-[16px] pt-[14px]">
        <span className="text-[13px] text-newTableText">{item.label}</span>
        {item.percentageChange !== undefined && (
          <TrendIndicator value={item.percentageChange} average={item.average} />
        )}
      </div>
      <div className="px-[16px] text-[26px] leading-[32px] font-semibold tracking-tight">
        {formatTotal(item)}
      </div>
      <div className="h-[110px] relative px-[8px] pt-[4px] pb-[8px]">
        <ChartSocial data={item.data} average={item.average} color={color} />
      </div>
    </div>
  );
};

// ranked rows with a bar: shares out of 100%, counts against the largest
const RankedList: FC<{ item: AnalyticsDataItem }> = ({ item }) => {
  const scale =
    item.format === 'percent'
      ? 100
      : Math.max(...item.top!.map((p) => p.total), 0) || 1;

  return (
    <div className={`${cardClass} px-[16px] py-[14px] gap-[10px]`}>
      <span className="text-[13px] text-newTableText">{item.label}</span>
      {item.top!.map((p) => (
        <div key={p.url || p.title} className="flex flex-col gap-[6px]">
          <div className="flex items-center gap-[12px] text-[14px]">
            {p.url ? (
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 truncate hover:text-[#612bd3] transition-colors"
              >
                {p.title}
              </a>
            ) : (
              <span className="flex-1 truncate">{p.title}</span>
            )}
            <span className="font-semibold">
              {formatValue(p.total, item.format)}
            </span>
          </div>
          <div className="h-[6px] rounded-full bg-newTableBorder overflow-hidden">
            <div
              className="h-full rounded-full bg-[#612bd3]"
              style={{ width: `${Math.min(100, (p.total / scale) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// cards in their sections, each section laid out as number tiles, then charts,
// then ranked lists
export const AnalyticsGrid: FC<{ items: AnalyticsDataItem[] }> = ({
  items,
}) => {
  const groups = new Map<string, AnalyticsDataItem[]>();
  for (const item of items) {
    groups.set(item.group || '', [...(groups.get(item.group || '') || []), item]);
  }

  return (
    <div className="flex flex-col gap-[28px]">
      {Array.from(groups).map(([group, list]) => {
        const stats = list.filter((p) => !p.top && p.data.length <= 1);
        const charts = list.filter((p) => !p.top && p.data.length > 1);
        const lists = list.filter((p) => p.top?.length);

        return (
          <div key={group} className="flex flex-col gap-[12px]">
            {!!group && (
              <h3 className="text-[16px] font-semibold">{group}</h3>
            )}
            {!!stats.length && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[12px]">
                {stats.map((p) => (
                  <StatTile key={p.label} item={p} />
                ))}
              </div>
            )}
            {!!charts.length && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[16px]">
                {charts.map((p, index) => (
                  <ChartCard key={p.label} item={p} index={index} />
                ))}
              </div>
            )}
            {!!lists.length && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-[16px]">
                {lists.map((p) => (
                  <RankedList key={p.label} item={p} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const EmptyState: FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
  const t = useT();

  return (
    <div className="col-span-full flex flex-col items-center justify-center py-[48px] px-[24px] bg-newTableHeader border border-newTableBorder rounded-[12px]">
      <div className="w-[48px] h-[48px] mb-[16px] rounded-full bg-[#612bd3]/10 flex items-center justify-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-[#612bd3]"
        >
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path d="M12 8v4l2 2" />
        </svg>
      </div>
      <p className="text-[15px] text-newTableText text-center mb-[12px]">
        {t(
          'this_channel_needs_to_be_refreshed',
          'This channel needs to be refreshed to display analytics'
        )}
      </p>
      <button
        onClick={onRefresh}
        className="inline-flex items-center gap-[6px] px-[16px] py-[8px] text-[14px] font-medium text-white bg-[#612bd3] hover:bg-[#5023b8] rounded-[8px] transition-colors"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M23 4v6h-6M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
        </svg>
        {t('refresh_channel', 'Refresh Channel')}
      </button>
    </div>
  );
};

export const RenderAnalytics: FC<{
  integration: Integration;
  date: number;
}> = (props) => {
  const { integration, date } = props;
  const [loading, setLoading] = useState(true);
  const fetch = useFetch();

  const load = useCallback(async () => {
    setLoading(true);
    const load = (
      await fetch(`/analytics/${integration.id}?date=${date}`)
    ).json();
    setLoading(false);
    return load;
  }, [integration, date]);

  const { data } = useSWR(`/analytics-${integration?.id}-${date}`, load, {
    refreshInterval: 0,
    refreshWhenHidden: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    revalidateOnMount: true,
  });

  const refreshChannel = useCallback(
    (
        integrationData: Integration & {
          identifier: string;
        }
      ) =>
      async () => {
        const { url } = await (
          await fetch(
            `/integrations/social/${integrationData.identifier}?refresh=${integrationData.internalId}`,
            {
              method: 'GET',
            }
          )
        ).json();
        window.location.href = url;
      },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-[48px]">
        <LoadingComponent />
      </div>
    );
  }

  if (!data?.length) {
    return <EmptyState onRefresh={refreshChannel(integration as any)} />;
  }

  return <AnalyticsGrid items={data} />;
};
