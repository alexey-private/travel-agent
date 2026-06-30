import { google } from 'googleapis';
import { ToolResult } from '../../types/tools';
import { DriveProvider, DriveListParams, DriveSearchParams, DriveReadParams, DriveCreateParams } from './DriveProvider';
import { GoogleTokenRepository } from '../../repositories/GoogleTokenRepository';

const DEFAULT_FOLDER_NAME = 'AI Travel Agent';

const EXPORTABLE_MIME: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

const MAX_READ_BYTES = 100_000;

export class GoogleDriveProvider implements DriveProvider {
  constructor(
    private tokenRepo: GoogleTokenRepository,
    private clientId: string,
    private clientSecret: string,
    private redirectUri: string,
    private folderName = DEFAULT_FOLDER_NAME,
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

    return { drive: google.drive({ version: 'v3', auth }), tokens };
  }

  private isShoppingFolder(): boolean {
    return this.folderName === 'AI Shopping Agent';
  }

  private getCachedFolderId(tokens: import('../../repositories/GoogleTokenRepository').GoogleTokens): string | null | undefined {
    return this.isShoppingFolder() ? tokens.shoppingDriveFolderId : tokens.driveFolderId;
  }

  private async saveFolder(userId: string, folderId: string): Promise<void> {
    if (this.isShoppingFolder()) {
      await this.tokenRepo.saveShoppingDriveFolderId(userId, folderId);
    } else {
      await this.tokenRepo.saveDriveFolderId(userId, folderId);
    }
  }

  private async getOrCreateFolder(userId: string): Promise<string> {
    const { drive, tokens } = await this.getClient(userId);

    const cached = this.getCachedFolderId(tokens);
    if (cached) return cached;

    const res = await drive.files.list({
      q: `mimeType = 'application/vnd.google-apps.folder' and name = '${this.folderName}' and trashed = false`,
      fields: 'files(id)',
      pageSize: 1,
    });

    const existing = res.data.files?.[0]?.id;
    if (existing) {
      await this.saveFolder(userId, existing);
      return existing;
    }

    const created = await drive.files.create({
      requestBody: {
        name: this.folderName,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    const folderId = created.data.id!;
    await this.saveFolder(userId, folderId);
    return folderId;
  }

  async list(params: DriveListParams): Promise<ToolResult> {
    try {
      const { drive } = await this.getClient(params.userId);
      const folderId = await this.getOrCreateFolder(params.userId);

      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        pageSize: Math.min(params.pageSize ?? 20, 50),
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

      return { success: true, data: { files, total: files.length, folder: this.folderName, source: 'google' } };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async search(params: DriveSearchParams): Promise<ToolResult> {
    try {
      const { drive } = await this.getClient(params.userId);
      const folderId = await this.getOrCreateFolder(params.userId);

      const escaped = params.query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const q = `name contains '${escaped}' and '${folderId}' in parents and trashed = false`;

      const res = await drive.files.list({
        q,
        pageSize: Math.min(params.pageSize ?? 20, 50),
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

      return { success: true, data: { files, total: files.length, query: params.query, folder: this.folderName, source: 'google' } };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async read(params: DriveReadParams): Promise<ToolResult> {
    try {
      const { drive } = await this.getClient(params.userId);

      const meta = await drive.files.get({ fileId: params.fileId, fields: 'id,name,mimeType' });
      const { name, mimeType } = meta.data;

      // Google Workspace files: export as text
      const exportMime = EXPORTABLE_MIME[mimeType ?? ''];
      if (exportMime) {
        const res = await drive.files.export(
          { fileId: params.fileId, mimeType: exportMime },
          { responseType: 'text' },
        );
        const content = String(res.data).slice(0, MAX_READ_BYTES);
        return { success: true, data: { name, mimeType: exportMime, content, truncated: content.length === MAX_READ_BYTES, source: 'google' } };
      }

      // Plain files: download as text
      const res = await drive.files.get(
        { fileId: params.fileId, alt: 'media' },
        { responseType: 'text' },
      );
      const raw = res.data as unknown as string;
      const content = (typeof raw === 'string' ? raw : JSON.stringify(raw)).slice(0, MAX_READ_BYTES);
      return { success: true, data: { name, mimeType, content, truncated: content.length === MAX_READ_BYTES, source: 'google' } };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async create(params: DriveCreateParams): Promise<ToolResult> {
    try {
      const { drive } = await this.getClient(params.userId);
      const folderId = await this.getOrCreateFolder(params.userId);

      const mimeType = params.mimeType ?? 'text/plain';
      const { Readable } = await import('stream');
      const body = Readable.from([params.content]);

      const res = await drive.files.create({
        requestBody: {
          name: params.name,
          mimeType,
          parents: [folderId],
        },
        media: { mimeType, body },
        fields: 'id,name,webViewLink',
      });

      return {
        success: true,
        data: {
          message: `File "${params.name}" saved to Google Drive in the "${this.folderName}" folder.`,
          file: { id: res.data.id, name: res.data.name, webViewLink: res.data.webViewLink },
          source: 'google',
        },
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
