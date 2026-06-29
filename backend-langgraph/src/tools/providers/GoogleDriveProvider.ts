import { google } from 'googleapis';
import { ToolResult } from '../../types/tools';
import { DriveProvider, DriveListParams, DriveSearchParams, DriveReadParams } from './DriveProvider';
import { GoogleTokenRepository } from '../../repositories/GoogleTokenRepository';

const EXPORTABLE_MIME: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

const READABLE_MIME = new Set([
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'application/json',
]);

const MAX_READ_BYTES = 100_000;

export class GoogleDriveProvider implements DriveProvider {
  constructor(
    private tokenRepo: GoogleTokenRepository,
    private clientId: string,
    private clientSecret: string,
    private redirectUri: string,
  ) {}

  private async getClient(userId: string) {
    const tokens = await this.tokenRepo.get(userId);
    if (!tokens) throw new Error('Google Drive not connected. Please connect your Google account in Settings.');

    const auth = new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectUri);
    auth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate,
    });

    auth.on('tokens', async (newTokens) => {
      if (newTokens.access_token) {
        await this.tokenRepo.save(userId, {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token ?? tokens.refreshToken,
          expiryDate: newTokens.expiry_date ?? tokens.expiryDate,
        });
      }
    });

    return google.drive({ version: 'v3', auth });
  }

  async list(params: DriveListParams): Promise<ToolResult> {
    try {
      const drive = await this.getClient(params.userId);
      const q = params.folderId
        ? `'${params.folderId}' in parents and trashed = false`
        : `'root' in parents and trashed = false`;

      const res = await drive.files.list({
        q,
        pageSize: params.pageSize ?? 20,
        fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
        orderBy: 'modifiedTime desc',
      });

      const files = (res.data.files ?? []).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size ? parseInt(f.size) : null,
        webViewLink: f.webViewLink,
      }));

      return { success: true, data: { files, total: files.length, source: 'google' } };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async search(params: DriveSearchParams): Promise<ToolResult> {
    try {
      const drive = await this.getClient(params.userId);
      const escaped = params.query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const q = `fullText contains '${escaped}' and trashed = false`;

      const res = await drive.files.list({
        q,
        pageSize: params.pageSize ?? 20,
        fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
        orderBy: 'modifiedTime desc',
      });

      const files = (res.data.files ?? []).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size ? parseInt(f.size) : null,
        webViewLink: f.webViewLink,
      }));

      return { success: true, data: { files, total: files.length, query: params.query, source: 'google' } };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async read(params: DriveReadParams): Promise<ToolResult> {
    try {
      const drive = await this.getClient(params.userId);

      const meta = await drive.files.get({
        fileId: params.fileId,
        fields: 'id,name,mimeType,size',
      });

      const { name, mimeType } = meta.data;

      // Google Workspace files: export as text
      const exportMime = EXPORTABLE_MIME[mimeType ?? ''];
      if (exportMime) {
        const res = await drive.files.export(
          { fileId: params.fileId, mimeType: exportMime },
          { responseType: 'text' },
        );
        const content = typeof res.data === 'string'
          ? res.data.slice(0, MAX_READ_BYTES)
          : JSON.stringify(res.data).slice(0, MAX_READ_BYTES);
        return { success: true, data: { name, mimeType: exportMime, content, truncated: content.length === MAX_READ_BYTES, source: 'google' } };
      }

      // Plain text and similar files: download directly
      if (READABLE_MIME.has(mimeType ?? '')) {
        const res = await drive.files.get(
          { fileId: params.fileId, alt: 'media' },
          { responseType: 'text' },
        );
        const raw = res.data as unknown as string;
        const content = (typeof raw === 'string' ? raw : JSON.stringify(raw)).slice(0, MAX_READ_BYTES);
        return { success: true, data: { name, mimeType, content, truncated: content.length === MAX_READ_BYTES, source: 'google' } };
      }

      return {
        success: false,
        error: `File "${name}" (${mimeType}) cannot be read as text. Only Google Docs, Sheets, plain text, CSV, JSON, and HTML files are supported.`,
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  private handleError(err: unknown): ToolResult {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('insufficientPermissions') ||
      msg.includes('Request had insufficient authentication scopes') ||
      msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')
    ) {
      return {
        success: false,
        error: 'Google Drive access not granted. Please go to Settings and reconnect your Google account to enable Drive access.',
      };
    }
    if (msg.includes('invalid_grant') || msg.includes('Token has been expired or revoked')) {
      return { success: false, error: 'Google account needs reconnection. Please go to Settings and reconnect.' };
    }
    return { success: false, error: msg };
  }
}
