import React, { FC, Fragment, useCallback, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Select } from '@gitroom/react/form/select';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { MissingReleaseModal } from '@gitroom/frontend/components/launches/missing-release.modal';
import { AnalyticsGrid } from '@gitroom/frontend/components/platform-analytics/render.analytics';

export const StatisticsModal: FC<{
  postId: string;
}> = (props) => {
  const { postId } = props;
  const t = useT();
  const fetch = useFetch();
  const [dateRange, setDateRange] = useState(7);

  const loadStatistics = useCallback(async () => {
    return (await fetch(`/posts/${postId}/statistics`)).json();
  }, [postId, fetch]);

  const loadPostAnalytics = useCallback(async () => {
    return (await fetch(`/analytics/post/${postId}?date=${dateRange}`)).json();
  }, [postId, dateRange, fetch]);

  const { data: statisticsData, isLoading: isLoadingStatistics } = useSWR(
    `/posts/${postId}/statistics`,
    loadStatistics
  );

  const { data: analyticsData, isLoading: isLoadingAnalytics, mutate: mutateAnalytics } = useSWR(
    `/analytics/post/${postId}?date=${dateRange}`,
    loadPostAnalytics,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  );

  const isMissing = analyticsData && !Array.isArray(analyticsData) && analyticsData.missing;

  const dateOptions = useMemo(() => {
    return [
      { key: 7, value: t('7_days', '7 Days') },
      { key: 30, value: t('30_days', '30 Days') },
      { key: 90, value: t('90_days', '90 Days') },
    ];
  }, [t]);

  const isLoading = isLoadingStatistics || isLoadingAnalytics;

  return (
    <div className="relative min-h-[200px]">
      {isLoading ? (
        <div className="flex items-center justify-center py-[40px]">
          <LoadingComponent />
        </div>
      ) : isMissing ? (
        <MissingReleaseModal postId={postId} onSuccess={() => mutateAnalytics()} />
      ) : (
        <div className="flex flex-col gap-[24px]">
          {/* Post Analytics Section */}
          {analyticsData && Array.isArray(analyticsData) && analyticsData.length > 0 && (
            <div className="flex flex-col gap-[14px]">
              <div className="flex items-center justify-between">
                <h3 className="text-[18px] font-[500]">
                  {t('post_analytics', 'Post Analytics')}
                </h3>
                <div className="max-w-[150px]">
                  <Select
                    label=""
                    name="date"
                    disableForm={true}
                    hideErrors={true}
                    value={dateRange}
                    onChange={(e) => setDateRange(+e.target.value)}
                  >
                    {dateOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.value}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              {/* keyed by range: the charts draw once, on mount */}
              <AnalyticsGrid key={dateRange} items={analyticsData} />
            </div>
          )}

          {/* Short Links Statistics Section */}
          <div className="flex flex-col gap-[14px]">
            <h3 className="text-[18px] font-[500]">
              {t('short_links_statistics', 'Short Links Statistics')}
            </h3>
            {statisticsData?.clicks?.length === 0 ? (
              <div className="text-gray-400">
                {t('no_short_link_results', 'No short link results')}
              </div>
            ) : (
              <div className="grid grid-cols-3">
                <div className="bg-forth p-[4px] rounded-tl-lg">
                  {t('short_link', 'Short Link')}
                </div>
                <div className="bg-forth p-[4px]">
                  {t('original_link', 'Original Link')}
                </div>
                <div className="bg-forth p-[4px] rounded-tr-lg">
                  {t('clicks', 'Clicks')}
                </div>
                {statisticsData?.clicks?.map((p: any) => (
                  <Fragment key={p.short}>
                    <div className="p-[4px] py-[10px] bg-customColor6">
                      {p.short}
                    </div>
                    <div className="p-[4px] py-[10px] bg-customColor6">
                      {p.original}
                    </div>
                    <div className="p-[4px] py-[10px] bg-customColor6">
                      {p.clicks}
                    </div>
                  </Fragment>
                ))}
              </div>
            )}
          </div>

          {/* No analytics available message */}
          {(!analyticsData || !Array.isArray(analyticsData) || analyticsData.length === 0) &&
            (!statisticsData?.clicks || statisticsData.clicks.length === 0) && (
              <div className="text-center text-gray-400 py-[20px]">
                {t('no_statistics_available', 'No statistics available for this post')}
              </div>
            )}
        </div>
      )}
    </div>
  );
};
