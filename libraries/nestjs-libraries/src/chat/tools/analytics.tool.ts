import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class AnalyticsTool implements AgentToolInterface {
  constructor(
    private _integrationService: IntegrationService,
    private _postsService: PostsService
  ) {}
  name = 'analyticsTool';

  run() {
    return createTool({
      id: 'analyticsTool',
      mcp: {
        annotations: {
          title: 'Get Analytics',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      description: `
Analytics of a channel (pass "integrationId" from integrationList) or of one published post (pass "postId" from postsListTool), the same data as the Analytics page and the post statistics.
Each metric has:
- "label" and "group" (the section it belongs to, e.g. Overview, Performance, Retention, Traffic Sources, Audience)
- "total": the value for the whole range (when missing, sum "data", or average it when "average" is true)
- "data": daily points { date, total }; for "Audience Retention" the date is the moment of the video and total the % of viewers still watching
- "top": ranked rows { title, total, url? } (top videos, traffic sources, countries, engagement rates)
- "format": "duration" means seconds, "percent" means 0-100; otherwise a count
YouTube Analytics data lags about 2 days. Instagram has no retention curve or traffic sources in its API.
`,
      inputSchema: z.object({
        integrationId: z
          .string()
          .optional()
          .describe('Channel id, for the channel analytics'),
        postId: z
          .string()
          .optional()
          .describe('Published post id, for the analytics of that post'),
        days: z
          .number()
          .optional()
          .describe('Range in days ending today: 7, 30 or 90 (default 7)'),
      }),
      outputSchema: z.object({
        output: z.object({
          missing: z
            .boolean()
            .optional()
            .describe(
              'True when the published post could not be found on the platform'
            ),
          metrics: z.array(z.any()),
        }),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organization = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        );
        const days = inputData.days || 7;

        if (inputData.postId) {
          const result = await this._postsService.checkPostAnalytics(
            organization.id,
            inputData.postId,
            days
          );
          return {
            output: Array.isArray(result)
              ? { metrics: result }
              : { missing: true, metrics: [] },
          };
        }

        if (!inputData.integrationId) {
          throw new Error('Pass an integrationId or a postId');
        }

        return {
          output: {
            metrics: await this._integrationService.checkAnalytics(
              organization,
              inputData.integrationId,
              String(days)
            ),
          },
        };
      },
    });
  }
}
