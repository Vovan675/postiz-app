import {
  AnalyticsData,
  AuthTokenDetails,
  PendingCheckResponse,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { Integration } from '@prisma/client';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library/build/src/auth/oauth2client';
import { YoutubeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import {
  BadBody,
  PublishedWithError,
  RefreshToken,
  SocialAbstract,
  ValidityMedia,
  stripQuery,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import * as process from 'node:process';
import dayjs from 'dayjs';
import { createReadStream, statSync } from 'fs';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { setHeartbeatDetails } from '@gitroom/nestjs-libraries/temporal/temporal.heartbeat';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

const clientAndYoutube = () => {
  const client = new google.auth.OAuth2({
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    redirectUri: `${process.env.FRONTEND_URL}/integrations/social/youtube`,
  });

  const youtube = (newClient: OAuth2Client) =>
    google.youtube({
      version: 'v3',
      auth: newClient,
    });

  const youtubeAnalytics = (newClient: OAuth2Client) =>
    google.youtubeAnalytics({
      version: 'v2',
      auth: newClient,
    });

  const oauth2 = (newClient: OAuth2Client) =>
    google.oauth2({
      version: 'v2',
      auth: newClient,
    });

  return { client, youtube, oauth2, youtubeAnalytics };
};

@Rules('YouTube must have on video attachment, it cannot be empty')
export class YoutubeProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 200; // YouTube has strict upload quotas
  identifier = 'youtube';
  name = 'YouTube';
  isBetweenSteps = true;
  dto = YoutubeSettingsDto;
  scopes = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtubepartner',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ];

  editor = 'normal' as const;
  maxLength() {
    return 5000;
  }

  override async checkValidity(
    items: Array<ValidityMedia[]>
  ): Promise<string | true> {
    const [firstItems] = items ?? [];
    if (items?.[0]?.length !== 1) {
      return 'You need one media';
    }
    if ((firstItems?.[0]?.path?.indexOf?.('mp4') ?? -1) === -1) {
      return 'Item must be a video';
    }
    return true;
  }

  override handleErrors(body: string):
    | {
        type: 'refresh-token' | 'bad-body';
        value: string;
      }
    | undefined {
    if (body.includes('invalidTags')) {
      return {
        type: 'bad-body',
        value: 'The maximum allowed is 500 characters in total.',
      };
    }

    if (body.includes('invalidTitle')) {
      return {
        type: 'bad-body',
        value:
          'We have uploaded your video but we could not set the title. Title is too long.',
      };
    }

    if (body.includes('invalidDescription')) {
      return {
        type: 'bad-body',
        value:
          'Your video description is invalid, it may contain disallowed characters such as < or >.',
      };
    }

    if (body.includes('invalidCategoryId')) {
      return {
        type: 'bad-body',
        value: 'The selected video category is invalid.',
      };
    }

    if (body.includes('invalidPublishAt')) {
      return {
        type: 'bad-body',
        value: 'The scheduled publishing time is invalid.',
      };
    }

    if (body.includes('invalidRecordingDetails')) {
      return {
        type: 'bad-body',
        value: 'The recording details for the video are invalid.',
      };
    }

    if (body.includes('invalidVideoGameRating')) {
      return {
        type: 'bad-body',
        value: 'The video game rating is invalid.',
      };
    }

    if (body.includes('invalidFilename')) {
      return {
        type: 'bad-body',
        value: 'The video file name is invalid.',
      };
    }

    if (body.includes('defaultLanguageNotSet')) {
      return {
        type: 'bad-body',
        value:
          'We could not set the localized video details because no default language is set.',
      };
    }

    if (body.includes('invalidVideoMetadata')) {
      return {
        type: 'bad-body',
        value:
          'Some of the video details are invalid, please review the title, description and tags.',
      };
    }

    if (body.includes('mediaBodyRequired')) {
      return {
        type: 'bad-body',
        value:
          'The video file is missing or could not be read, please re-upload the video.',
      };
    }

    if (body.includes('imageFormatUnsupported')) {
      return {
        type: 'bad-body',
        value:
          'We have uploaded your video but the thumbnail format is not supported, please use JPEG or PNG.',
      };
    }

    if (body.includes('imageTooTall')) {
      return {
        type: 'bad-body',
        value:
          'We have uploaded your video but the thumbnail image is too tall.',
      };
    }

    if (body.includes('imageTooWide')) {
      return {
        type: 'bad-body',
        value:
          'We have uploaded your video but the thumbnail image is too wide.',
      };
    }

    if (body.includes('defaultVideoInsertPerDayPerProject')) {
      return {
        type: 'bad-body',
        value:
          "YouTube's daily upload quota is exhausted for today, please reschedule this post for a later time.",
      };
    }

    if (body.includes('rateLimitExceeded')) {
      return {
        type: 'bad-body',
        value:
          'You are sending requests too quickly, please wait a little while and try again.',
      };
    }

    if (body.includes('failedPrecondition')) {
      return {
        type: 'bad-body',
        value:
          'We have uploaded your video but we could not set the thumbnail. Thumbnail size is too large.',
      };
    }

    if (body.includes('uploadLimitExceeded')) {
      return {
        type: 'bad-body',
        value:
          'You have reached your daily upload limit, please try again tomorrow.',
      };
    }

    if (body.includes('youtubeSignupRequired')) {
      return {
        type: 'bad-body',
        value:
          'You have to link your youtube account to your google account first.',
      };
    }

    if (body.includes('youtube.thumbnail')) {
      return {
        type: 'bad-body',
        value:
          'Your video was uploaded to YouTube successfully, but we could not set the thumbnail: custom thumbnails require a phone-verified YouTube channel. Verify your channel at youtube.com/verify, and set this video\'s thumbnail manually in YouTube Studio.',
      };
    }

    if (body.includes('Unauthorized')) {
      return {
        type: 'refresh-token',
        value:
          'Token expired or invalid, please reconnect your YouTube account.',
      };
    }

    if (body.includes('UNAUTHENTICATED') || body.includes('invalid_grant')) {
      return {
        type: 'refresh-token',
        value: 'Please re-authenticate your YouTube account',
      };
    }

    return undefined;
  }

  refreshErrorMessage(err: any): string | undefined {
    const data = err?.response?.data || {};
    const text = `${data.error_subtype || ''} ${data.error_description || ''} ${
      err?.message || ''
    }`;

    if (text.includes('invalid_rapt')) {
      return `because your organization's Google Workspace session policy invalidated its access. Ask your Google Workspace admin to mark Postiz as a trusted app and turn on "Exempt trusted apps" (https://support.google.com/a/answer/9368756) to prevent this from happening again`;
    }

    return undefined;
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    const { client, oauth2 } = clientAndYoutube();
    client.setCredentials({ refresh_token });
    const { credentials } = await client.refreshAccessToken();
    const user = oauth2(client);
    const expiryDate = new Date(credentials.expiry_date!);
    const unixTimestamp =
      Math.floor(expiryDate.getTime() / 1000) -
      Math.floor(new Date().getTime() / 1000);

    const { data } = await user.userinfo.get();

    return {
      accessToken: credentials.access_token!,
      expiresIn: unixTimestamp!,
      refreshToken: credentials.refresh_token ?? refresh_token,
      id: data.id!,
      name: data.name!,
      picture: data?.picture || '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeSecureId(7);
    const { client } = clientAndYoutube();
    return {
      url: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        state,
        redirect_uri: `${process.env.FRONTEND_URL}/integrations/social/youtube`,
        scope: this.scopes.slice(0),
      }),
      codeVerifier: makeSecureId(11),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const { client, oauth2 } = clientAndYoutube();
    const { tokens } = await client.getToken(params.code);
    client.setCredentials(tokens);
    const { scopes } = await client.getTokenInfo(tokens.access_token!);
    this.checkScopes(this.scopes, scopes);

    const user = oauth2(client);
    const { data } = await user.userinfo.get();

    const expiryDate = new Date(tokens.expiry_date!);
    const unixTimestamp =
      Math.floor(expiryDate.getTime() / 1000) -
      Math.floor(new Date().getTime() / 1000);

    return {
      accessToken: tokens.access_token!,
      expiresIn: unixTimestamp,
      refreshToken: tokens.refresh_token!,
      id: data.id!,
      name: data.name!,
      picture: data?.picture || '',
      username: '',
    };
  }

  async pages(accessToken: string) {
    const { client, youtube } = clientAndYoutube();
    client.setCredentials({ access_token: accessToken });
    const youtubeClient = youtube(client);

    try {
      // Get all channels the user has access to
      const response = await youtubeClient.channels.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        mine: true,
      });

      const channels = response.data.items || [];

      return channels.map((channel) => ({
        id: channel.id!,
        name: channel.snippet?.title || 'Unnamed Channel',
        picture: {
          data: {
            url: channel.snippet?.thumbnails?.default?.url || '',
          },
        },
        username: channel.snippet?.customUrl || '',
        subscriberCount: channel.statistics?.subscriberCount || '0',
      }));
    } catch (error) {
      console.error('Failed to fetch YouTube channels:', error);
      return [];
    }
  }

  async fetchPageInformation(accessToken: string, data: { id: string }) {
    const { client, youtube } = clientAndYoutube();
    client.setCredentials({ access_token: accessToken });
    const youtubeClient = youtube(client);

    try {
      const response = await youtubeClient.channels.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        id: [data.id],
      });

      const channel = response.data.items?.[0];

      if (!channel) {
        throw new Error('Channel not found');
      }

      return {
        id: channel.id!,
        name: channel.snippet?.title || 'Unnamed Channel',
        access_token: accessToken,
        picture: channel.snippet?.thumbnails?.default?.url || '',
        username: channel.snippet?.customUrl || '',
      };
    } catch (error) {
      console.error('Failed to fetch YouTube channel information:', error);
      throw error;
    }
  }

  async reConnect(
    id: string,
    requiredId: string,
    accessToken: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>> {
    const { client, youtube } = clientAndYoutube();
    client.setCredentials({ access_token: accessToken });

    // don't go through pages() here, it swallows the real Google error and an
    // empty list would be reported as a missing channel
    const { data } = await youtube(client).channels.list({
      part: ['id'],
      mine: true,
    });

    if (!(data.items || []).some((p) => p.id === requiredId)) {
      throw new Error('Channel not found');
    }

    const information = await this.fetchPageInformation(accessToken, {
      id: requiredId,
    });

    return {
      id: information.id,
      name: information.name,
      accessToken: information.access_token,
      picture: information.picture,
      username: information.username,
    };
  }

  // ---------------------------------------------------------------------------
  // RESUMABLE UPLOAD (no more videos.insert): YouTube only creates the video
  // resource when the final byte of the session is received, so a failed or
  // retried upload can never leave a video behind - and the session URI can
  // always be asked whether the video was created (the "unknown outcome" cure).
  // ---------------------------------------------------------------------------
  // YouTube requires chunk sizes to be a multiple of 256KB (except the last).
  private static readonly YOUTUBE_CHUNK_SIZE = 8 * 1024 * 1024;
  // Keep each upload batch well below the 10-minute activity timeout, the
  // workflow calls finalizePost again for the remaining bytes.
  private static readonly YOUTUBE_UPLOAD_BATCH_MS = 4 * 60 * 1000;

  // Resolves the total byte size of the media without loading it into memory:
  // a HEAD request for remote URLs, statSync for local files.
  private async youtubeMediaSize(path: string): Promise<number> {
    if (path.indexOf('http') === 0) {
      // the media path is user-influenced, keep the SSRF-safe dispatcher that
      // this.fetch applies to every other outbound request. identity encoding
      // so content-length matches the bytes a later GET actually streams
      // (fetch transparently decompresses encoded bodies).
      setHeartbeatDetails(`youtube: media size ${stripQuery(path)}`);
      const head = await fetch(path, {
        method: 'HEAD',
        headers: { 'accept-encoding': 'identity' },
        dispatcher: getSsrfSafeDispatcher(),
      } as any);
      const length = head.headers.get('content-length');
      if (!length) {
        throw new BadBody(
          this.identifier,
          '{}',
          '{}',
          'Could not determine the video size for the YouTube upload'
        );
      }
      return Number(length);
    }

    return statSync(path).size;
  }

  // Returns a streaming body for the [start, end] byte range of the media so we
  // never hold the whole file in memory: a ranged GET for remote URLs, a ranged
  // read stream for local files.
  private async youtubeChunkStream(path: string, start: number, end: number) {
    if (path.indexOf('http') === 0) {
      // identity encoding so the store keeps content-length and can answer
      // with the requested range: a transformed (compressed) response loses
      // its length, and a length-less object is answered with the full body.
      setHeartbeatDetails(
        `youtube: read media ${start}-${end} ${stripQuery(path)}`
      );
      const response = await fetch(path, {
        headers: {
          Range: `bytes=${start}-${end}`,
          'accept-encoding': 'identity',
        },
        dispatcher: getSsrfSafeDispatcher(),
      } as any);

      // A store that ignores Range (200 with the full file) or answers with an
      // error page would corrupt the upload at this offset.
      if (response.status !== 206) {
        throw new BadBody(
          this.identifier,
          '{}',
          '{}',
          'The media storage did not return the requested byte range, please try again'
        );
      }

      return response.body;
    }

    return createReadStream(path, { start, end });
  }

  // Asks the upload session for the truth: the created video when the upload
  // completed, or the exact byte offset to resume from. We use the global fetch
  // because the probe answers with 308 (Resume Incomplete), which this.fetch
  // would treat as an error.
  private async probeUploadSession(
    accessToken: string,
    uploadUri: string,
    videoSize: number
  ): Promise<{ videoId: string } | { uploadedBytes: number }> {
    setHeartbeatDetails('youtube: probe resumable session');
    const probe = await fetch(uploadUri, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Range': `bytes */${videoSize}`,
      },
    });

    if (probe.status === 200 || probe.status === 201) {
      const { id } = await probe.json();
      return { videoId: String(id) };
    }

    if (probe.status === 308) {
      const range = probe.headers.get('range');
      return {
        uploadedBytes: range ? Number(range.split('-')[1]) + 1 : 0,
      };
    }

    const text = await probe.text().catch(() => '{}');

    // Transient Google-side errors: the session stays resumable, so throw a
    // plain error - the caller treats it as "probe again later" instead of
    // permanently failing a resumable upload.
    if (probe.status === 429 || probe.status >= 500) {
      throw new Error(
        `YouTube upload status check failed with ${probe.status}`
      );
    }

    const handleError = this.handleErrors(text);

    // this.fetch has the same 401 fallback: Google 401 bodies don't always
    // match the handleErrors strings
    if (probe.status === 401 || handleError?.type === 'refresh-token') {
      throw new RefreshToken(this.identifier, text, '{}');
    }

    throw new BadBody(
      this.identifier,
      text,
      '{}',
      probe.status === 404 || probe.status === 410
        ? 'The upload session expired before the video was uploaded, please post again'
        : handleError?.value || 'Failed to check the video upload status'
    );
  }

  async postPending(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost, ...comments] = postDetails;

    const { settings }: { settings: YoutubeSettingsDto } = firstPost;
    const path = firstPost?.media?.[0]?.path!;
    const videoSize = await this.youtubeMediaSize(path);

    // Start a resumable upload session: nothing exists on the channel until
    // the final byte is received, so nothing here is irreversible yet - the
    // bytes themselves are streamed by finalizePost, outside this activity.
    const session = await this.fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=id,snippet,status&notifySubscribers=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': String(videoSize),
        },
        body: JSON.stringify({
          snippet: {
            title: settings.title,
            description: firstPost?.message,
            ...(settings?.language
              ? {
                  defaultLanguage: settings.language,
                  defaultAudioLanguage: settings.language,
                }
              : {}),
            ...(settings?.categoryId ? { categoryId: settings.categoryId } : {}),
            ...(settings?.tags?.length
              ? { tags: settings.tags.map((p) => p.label) }
              : {}),
          },
          status: {
            privacyStatus: settings.type,
            selfDeclaredMadeForKids: settings.selfDeclaredMadeForKids === 'yes',
          },
        }),
      }
    );

    const uploadUri = session.headers.get('location');
    if (!uploadUri) {
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        'Could not start the video upload, please try again'
      );
    }

    return [
      {
        id: firstPost.id,
        releaseURL: '',
        postId: '',
        status: 'pending',
        pendingData: {
          uploadUri,
          videoSize,
          path,
          uploadedBytes: 0,
          // the YouTube setting wins, so posts that set both keep publishing
          // with the one they always had
          thumbnail:
            settings?.thumbnail?.path || firstPost?.media?.[0]?.thumbnail || '',
          postDbId: firstPost.id,
        },
      },
    ];
  }

  override async checkPostStatus(
    accessToken: string,
    pendingData: {
      uploadUri: string;
      videoSize: number;
      path: string;
      uploadedBytes: number;
      thumbnail: string;
      videoId?: string;
      postDbId?: string;
    },
    integration: Integration
  ): Promise<PendingCheckResponse> {
    let probe: { videoId: string } | { uploadedBytes: number };
    try {
      probe = await this.probeUploadSession(
        accessToken,
        pendingData.uploadUri,
        pendingData.videoSize
      );
    } catch (err) {
      if (err instanceof RefreshToken || err instanceof BadBody) {
        throw err;
      }

      // transient network error, the workflow will check again
      return { status: 'pending', pendingData };
    }

    // the upload completed: the video exists, only the thumbnail may be left
    if ('videoId' in probe) {
      if (pendingData.thumbnail) {
        return {
          status: 'ready',
          pendingData: { ...pendingData, videoId: probe.videoId },
        };
      }

      return {
        status: 'completed',
        postId: probe.videoId,
        releaseURL: `https://www.youtube.com/watch?v=${probe.videoId}`,
      };
    }

    // bytes are still missing, finalizePost resumes from the exact offset
    return {
      status: 'ready',
      pendingData: { ...pendingData, uploadedBytes: probe.uploadedBytes },
    };
  }

  override async finalizePost(
    accessToken: string,
    pendingData: {
      uploadUri: string;
      videoSize: number;
      path: string;
      uploadedBytes: number;
      thumbnail: string;
      videoId?: string;
      postDbId?: string;
    },
    integration: Integration
  ): Promise<PendingCheckResponse> {
    let videoId = pendingData.videoId;

    if (!videoId) {
      // ask the session for the truth before sending anything - a previous
      // run may have died mid-chunk, or even completed without us knowing
      const probe = await this.probeUploadSession(
        accessToken,
        pendingData.uploadUri,
        pendingData.videoSize
      );

      if ('uploadedBytes' in probe) {
        const started = Date.now();
        let uploaded = probe.uploadedBytes;

        while (uploaded < pendingData.videoSize) {
          // batch budget exhausted: hand back to the workflow, the next
          // finalizePost resumes from the offset the session reports
          if (Date.now() - started > YoutubeProvider.YOUTUBE_UPLOAD_BATCH_MS) {
            return {
              status: 'pending',
              pendingData: { ...pendingData, uploadedBytes: uploaded },
            };
          }

          const end =
            Math.min(
              uploaded + YoutubeProvider.YOUTUBE_CHUNK_SIZE,
              pendingData.videoSize
            ) - 1;
          const body = await this.youtubeChunkStream(
            pendingData.path,
            uploaded,
            end
          );

          setHeartbeatDetails('youtube: upload chunk to google');
          const upload = await fetch(pendingData.uploadUri, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'video/mp4',
              'Content-Length': String(end - uploaded + 1),
              'Content-Range': `bytes ${uploaded}-${end}/${pendingData.videoSize}`,
            },
            body,
            // Required by undici when streaming a request body.
            duplex: 'half',
          } as any);

          // more bytes expected, resume from the offset the session reports
          if (upload.status === 308) {
            const range = upload.headers.get('range');
            if (!range) {
              // no committed range reported: don't guess the offset, let the
              // next probe find the truth
              return {
                status: 'pending',
                pendingData: { ...pendingData, uploadedBytes: uploaded },
              };
            }
            uploaded = Number(range.split('-')[1]) + 1;
            continue;
          }

          // final chunk received: the video now exists on the channel
          if (upload.status === 200 || upload.status === 201) {
            const { id } = await upload.json();
            videoId = String(id);
            break;
          }

          const text = await upload.text().catch(() => '{}');

          // Transient Google-side errors: the session stays resumable, a plain
          // error makes the workflow probe and resume instead of failing the
          // whole upload.
          if (upload.status === 429 || upload.status >= 500) {
            throw new Error(
              `YouTube chunk upload failed with ${upload.status}`
            );
          }

          const handleError = this.handleErrors(text);

          if (upload.status === 401 || handleError?.type === 'refresh-token') {
            throw new RefreshToken(this.identifier, text, '{}');
          }

          throw new BadBody(
            this.identifier,
            text,
            '{}',
            handleError?.value || 'Failed to upload the video to YouTube'
          );
        }

        if (!videoId) {
          // all bytes sent without a confirmation, the next check asks the session
          return {
            status: 'pending',
            pendingData: { ...pendingData, uploadedBytes: uploaded },
          };
        }
      } else {
        videoId = probe.videoId;
      }
    }

    const releaseURL = `https://www.youtube.com/watch?v=${videoId}`;

    if (pendingData.thumbnail) {
      const { client, youtube } = clientAndYoutube();
      client.setCredentials({ access_token: accessToken });
      const youtubeClient = youtube(client);

      try {
        await this.runInConcurrent(async () =>
          youtubeClient.thumbnails.set({
            videoId,
            media: {
              body: (
                await this.getSsrfSafeAxios()({
                  url: pendingData.thumbnail,
                  method: 'GET',
                  responseType: 'stream',
                })
              ).data,
            },
          })
        );
      } catch (err) {
        // the video is already live: a rejected thumbnail must not lose its id
        // and URL (a token problem is left to the refresh + retry path, the
        // thumbnail call is idempotent)
        if (err instanceof BadBody && pendingData.postDbId) {
          throw new PublishedWithError(
            this.identifier,
            pendingData.postDbId,
            videoId,
            releaseURL,
            err.message
          );
        }
        throw err;
      }
    }

    return {
      status: 'completed',
      postId: videoId,
      releaseURL,
    };
  }

  // Old blocking behavior, kept for workflow versions before v1.0.6 that still
  // run and don't know how to resolve a `pending` response - they upload and
  // set the thumbnail inside the activity like before.
  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [response] = await this.postPending(
      id,
      accessToken,
      postDetails,
      integration
    );

    if (response.status !== 'pending') {
      return [response];
    }

    let pendingData = response.pendingData;
    const started = Date.now();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Cap below the 10-minute activity timeout of the old workflows using
      // this method, leaving room for one more full upload batch: failing here
      // is safe (no video exists until the upload completes and the abandoned
      // session just expires), timing the activity out is not.
      if (
        Date.now() - started >
        8 * 60 * 1000 - YoutubeProvider.YOUTUBE_UPLOAD_BATCH_MS
      ) {
        throw new BadBody(
          this.identifier,
          '{}',
          '{}',
          'The video upload took too long, please try a smaller video'
        );
      }

      const finalize = await this.finalizePost(
        accessToken,
        pendingData,
        integration
      );

      if (finalize.status === 'completed') {
        return [
          {
            id: response.id,
            releaseURL: finalize.releaseURL,
            postId: finalize.postId,
            status: 'success',
          },
        ];
      }

      pendingData = finalize.pendingData;
    }
  }

  // One YouTube Analytics report as rows keyed by column name
  private async youtubeReport(
    accessToken: string,
    params: {
      startDate: string;
      endDate: string;
      metrics: string;
      dimensions?: string;
      filters?: string;
      sort?: string;
      maxResults?: number;
    }
  ) {
    const { client, youtubeAnalytics } = clientAndYoutube();
    client.setCredentials({ access_token: accessToken });
    const { data } = await youtubeAnalytics(client).reports.query({
      ids: 'channel==MINE',
      ...params,
    });

    const columns = (data.columnHeaders || []).map((p) => p.name!);
    return (data.rows || []).map(
      (row) =>
        Object.fromEntries(columns.map((c, i) => [c, row[i]])) as Record<
          string,
          any
        >
    );
  }

  private youtubeRange(date: number) {
    return {
      startDate: dayjs().subtract(date, 'day').format('YYYY-MM-DD'),
      endDate: dayjs().format('YYYY-MM-DD'),
    };
  }

  // Daily chart + whole-range value for every metric, of the channel or of one
  // video (filters: video==id). The range value comes from its own report:
  // averaging the daily averages would weigh a 1-view day like a 1000-view one.
  private async youtubeMetricCards(
    accessToken: string,
    date: number,
    filters?: string
  ): Promise<AnalyticsData[]> {
    const metrics: Array<[string, string, string, AnalyticsData['format']?]> = [
      ['views', 'Views', 'Performance'],
      // Shorts count every play as a view since 2025, engaged views are the
      // ones that kept watching
      ['engagedViews', 'Engaged Views', 'Performance'],
      ['estimatedMinutesWatched', 'Watch Time (minutes)', 'Performance'],
      ['averageViewDuration', 'Average View Duration', 'Performance', 'duration'],
      ['averageViewPercentage', 'Average View Percentage', 'Performance', 'percent'],
      ['likes', 'Likes', 'Engagement'],
      ['comments', 'Comments', 'Engagement'],
      ['shares', 'Shares', 'Engagement'],
      ['subscribersGained', 'Subscribers Gained', 'Engagement'],
      ['subscribersLost', 'Subscribers Lost', 'Engagement'],
    ];

    const range = {
      ...this.youtubeRange(date),
      metrics: metrics.map(([metric]) => metric).join(','),
      ...(filters ? { filters } : {}),
    };

    const [days, [period]] = await Promise.all([
      this.youtubeReport(accessToken, {
        ...range,
        dimensions: 'day',
        sort: 'day',
      }),
      this.youtubeReport(accessToken, range),
    ]);

    return metrics.map(([metric, label, group, format]) => ({
      label,
      group,
      format,
      average: !!format,
      percentageChange: 0,
      total: Number(period?.[metric] || 0),
      data: days.map((p) => ({ total: p[metric], date: p.day })),
    }));
  }

  // Where the views of the range come from and who watched them, as shares of
  // the views. A report YouTube has no data for is left out.
  private async youtubeBreakdowns(
    accessToken: string,
    date: number,
    filters?: string
  ): Promise<AnalyticsData[]> {
    const sources: Record<string, string> = {
      SHORTS: 'Shorts feed',
      YT_SEARCH: 'YouTube search',
      RELATED_VIDEO: 'Suggested videos',
      SUBSCRIBER: 'Browse features',
      YT_CHANNEL: 'Channel pages',
      YT_OTHER_PAGE: 'Other YouTube features',
      YT_PLAYLIST_PAGE: 'Playlist pages',
      PLAYLIST: 'Playlists',
      EXT_URL: 'External',
      NO_LINK_OTHER: 'Direct or unknown',
      NOTIFICATION: 'Notifications',
      END_SCREEN: 'End screens',
      HASHTAGS: 'Hashtag pages',
      SOUND_PAGE: 'Sound pages',
      ADVERTISING: 'Ads',
    };
    const regions = new Intl.DisplayNames(['en'], { type: 'region' });

    const reports: Array<[string, string, string, (key: string) => string]> = [
      [
        'Traffic Sources',
        'Traffic Sources',
        'insightTrafficSourceType',
        (key) =>
          sources[key] ||
          key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' '),
      ],
      [
        'Subscribers vs Non-subscribers',
        'Audience',
        'subscribedStatus',
        (key) => (key === 'SUBSCRIBED' ? 'Subscribers' : 'Non-subscribers'),
      ],
      ['Top Countries', 'Audience', 'country', (key) => regions.of(key) || key],
    ];

    const cards = await Promise.all(
      reports.map(([label, group, dimension, name]) =>
        this.youtubeReport(accessToken, {
          ...this.youtubeRange(date),
          metrics: 'views',
          dimensions: dimension,
          ...(filters ? { filters } : {}),
        })
          .then((rows): AnalyticsData | null => {
            const sum = rows.reduce((acc, p) => acc + Number(p.views), 0);
            if (!sum) {
              return null;
            }

            return {
              label,
              group,
              format: 'percent',
              percentageChange: 0,
              data: [],
              top: rows
                .sort((a, b) => b.views - a.views)
                .slice(0, 8)
                .map((p) => ({
                  title: name(p[dimension]),
                  total: (Number(p.views) / sum) * 100,
                })),
            };
          })
          .catch(() => null)
      )
    );

    return cards.filter((p): p is AnalyticsData => !!p);
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    try {
      const { client, youtube } = clientAndYoutube();
      client.setCredentials({ access_token: accessToken });
      const youtubeClient = youtube(client);

      const [cards, breakdowns, channel, topRows] = await Promise.all([
        this.youtubeMetricCards(accessToken, date),
        this.youtubeBreakdowns(accessToken, date),
        youtubeClient.channels.list({ part: ['statistics'], id: [id] }),
        this.youtubeReport(accessToken, {
          ...this.youtubeRange(date),
          metrics: 'views',
          dimensions: 'video',
          sort: '-views',
          maxResults: 10,
        }).catch(() => [] as Record<string, any>[]),
      ]);

      const titles = topRows.length
        ? (
            await youtubeClient.videos.list({
              part: ['snippet'],
              id: topRows.map((p) => p.video),
            })
          ).data.items || []
        : [];

      const stats = channel.data.items?.[0]?.statistics;
      const lifetime = (label: string, value?: string | null) => ({
        label,
        group: 'Channel',
        percentageChange: 0,
        total: Number(value || 0),
        data: [],
      });

      return [
        lifetime('Subscribers', stats?.subscriberCount),
        lifetime('Total Views', stats?.viewCount),
        lifetime('Videos', stats?.videoCount),
        ...cards,
        ...(topRows.length
          ? [
              {
                label: 'Top Videos (views)',
                group: 'Top Videos',
                percentageChange: 0,
                data: [],
                top: topRows.map((p) => ({
                  title:
                    titles.find((v) => v.id === p.video)?.snippet?.title ||
                    p.video,
                  url: `https://www.youtube.com/watch?v=${p.video}`,
                  total: Number(p.views),
                })),
              },
            ]
          : []),
        ...breakdowns,
      ];
    } catch (err) {
      return [];
    }
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number
  ): Promise<AnalyticsData[]> {
    try {
      const { client, youtube } = clientAndYoutube();
      client.setCredentials({ access_token: accessToken });
      const youtubeClient = youtube(client);

      const filters = `video==${postId}`;
      const [response, cards, breakdowns, retention] = await Promise.all([
        youtubeClient.videos.list({
          part: ['statistics', 'contentDetails'],
          id: [postId],
        }),
        // YouTube Analytics lags ~2 days and needs the analytics scope, the
        // lifetime counters below still show when it has nothing
        this.youtubeMetricCards(accessToken, date, filters).catch(
          () => [] as AnalyticsData[]
        ),
        this.youtubeBreakdowns(accessToken, date, filters),
        // share of the viewers still watching at each 1% of the video
        this.youtubeReport(accessToken, {
          ...this.youtubeRange(date),
          metrics: 'audienceWatchRatio',
          dimensions: 'elapsedVideoTimeRatio',
          filters,
        }).catch(() => [] as Record<string, any>[]),
      ]);

      const video = response.data.items?.[0];
      const stats = video?.statistics;

      if (!stats) {
        return [];
      }

      // ISO 8601 duration, e.g. PT1M42S
      const [, h = 0, m = 0, s = 0] = (
        video?.contentDetails?.duration?.match(
          /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
        ) || []
      ).map((p) => Number(p) || 0);
      const length = h * 3600 + m * 60 + s;
      const clock = (seconds: number) => {
        const rounded = Math.round(seconds);
        return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(
          2,
          '0'
        )}`;
      };

      return [
        ...(
          [
            ['Views (all time)', stats.viewCount],
            ['Likes (all time)', stats.likeCount],
            ['Comments (all time)', stats.commentCount],
          ] as const
        )
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([label, value]) => ({
            label,
            group: 'Overview',
            percentageChange: 0,
            total: Number(value),
            data: [],
          })),
        ...(length
          ? [
              {
                label: 'Video Length',
                group: 'Overview',
                format: 'duration' as const,
                percentageChange: 0,
                total: length,
                data: [],
              },
            ]
          : []),
        ...cards,
        // the curve's average is the average view percentage
        ...(retention.length
          ? [
              {
                label: 'Audience Retention',
                group: 'Retention',
                format: 'percent' as const,
                average: true,
                percentageChange: 0,
                data: retention.map((p) => ({
                  total: Number(p.audienceWatchRatio) * 100,
                  date: length
                    ? clock(Number(p.elapsedVideoTimeRatio) * length)
                    : `${Math.round(Number(p.elapsedVideoTimeRatio) * 100)}%`,
                })),
              },
            ]
          : []),
        ...breakdowns,
      ];
    } catch (err: any) {
      // Expired or revoked token, checkPostAnalytics refreshes it and retries once
      if (err?.response?.status === 401) {
        throw new RefreshToken(
          this.identifier,
          JSON.stringify(err.response.data || {}),
          '{}'
        );
      }
      console.error(
        'Error fetching YouTube post analytics:',
        err?.message || err
      );
      return [];
    }
  }

  // Tag stats for the settings tag picker: YouTube autocomplete (free) tells
  // whether people search the tag, the top 10 search results tell how much
  // traffic it gets and which tags the ranking videos use. Every tag costs one
  // search.list call from its own 100/day bucket, so it only runs on demand.
  async tagStats(
    accessToken: string,
    data: { tags: string[]; language?: string }
  ) {
    const { client, youtube } = clientAndYoutube();
    client.setCredentials({ access_token: accessToken });
    const youtubeClient = youtube(client);
    const language = data?.language || 'en';

    try {
      return await Promise.all(
        (data?.tags || []).slice(0, 30).map(async (tag) => {
          const [autocomplete, search] = await Promise.all([
            fetch(
              `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=${language}&q=${encodeURIComponent(
                tag
              )}`
            )
              .then((res) => res.json())
              .then((res) => (res?.[1] || []) as string[])
              .catch(() => [] as string[]),
            youtubeClient.search.list({
              part: ['id'],
              q: tag,
              type: ['video'],
              maxResults: 10,
              relevanceLanguage: language,
            }),
          ]);

          const ids = (search.data.items || [])
            .map((p) => p.id?.videoId)
            .filter((p): p is string => !!p);
          const videos = ids.length
            ? (
                await youtubeClient.videos.list({
                  part: ['statistics', 'snippet'],
                  id: ids,
                })
              ).data.items || []
            : [];

          const lower = tag.toLowerCase();
          const views = videos
            .map((p) => Number(p.statistics?.viewCount || 0))
            .sort((a, b) => a - b);

          return {
            tag,
            // -1 when people don't search the tag as a whole
            searchRank: autocomplete.findIndex((p) => p.toLowerCase() === lower),
            autocomplete,
            medianViews: views.length ? views[Math.floor(views.length / 2)] : 0,
            topCount: videos.length,
            topUsing: videos.filter(
              (p) =>
                (p.snippet?.tags || []).some((t) => t.toLowerCase() === lower) ||
                (p.snippet?.title || '').toLowerCase().includes(lower)
            ).length,
            topTags: videos.flatMap((p) => p.snippet?.tags || []),
          };
        })
      );
    } catch (err: any) {
      if (err?.response?.status === 401) {
        throw new RefreshToken(
          this.identifier,
          JSON.stringify(err.response.data || {}),
          '{}'
        );
      }
      throw err;
    }
  }
}
