import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';

type WishlistAction = 'add' | 'remove' | 'list' | 'clear';

interface WishlistInput {
  action: WishlistAction;
  userId: string;
  productName?: string;
  productUrl?: string;
  price?: number;
  notes?: string;
}

interface WishlistItem {
  id: string;
  productName: string;
  productUrl: string;
  price?: number;
  notes?: string;
  addedAt: string;
}

// In-memory store keyed by userId
const wishlistStore = new Map<string, WishlistItem[]>();

function generateId(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class WishlistTool extends BaseTool {
  readonly name = 'manage_wishlist';
  readonly description =
    'Manage a personal shopping wishlist — add, remove, list, or clear saved products. ' +
    'Use when the user wants to save a product for later, view their saved items, or remove something from their wishlist.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'remove', 'list', 'clear'],
        description: '"add" a product, "remove" a product by name, "list" all saved items, or "clear" the entire wishlist',
      },
      userId: {
        type: 'string',
        description: 'User identifier to scope the wishlist',
      },
      productName: {
        type: 'string',
        description: 'Product name (required for add/remove)',
      },
      productUrl: {
        type: 'string',
        description: 'Product URL or store link (optional, for add)',
      },
      price: {
        type: 'number',
        description: 'Product price in USD (optional, for add)',
      },
      notes: {
        type: 'string',
        description: 'Personal notes about the product, e.g. "size M", "birthday gift for Alice" (optional, for add)',
      },
    },
    required: ['action', 'userId'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { action, userId, productName, productUrl, price, notes } = input as WishlistInput;

    if (!wishlistStore.has(userId)) {
      wishlistStore.set(userId, []);
    }
    const list = wishlistStore.get(userId)!;

    switch (action) {
      case 'add': {
        if (!productName) {
          return { success: false, error: 'productName is required for add action' };
        }
        const id = generateId(`${userId}${productName}${Date.now()}`);
        const item: WishlistItem = {
          id,
          productName,
          productUrl: productUrl ?? '',
          price,
          notes,
          addedAt: new Date().toISOString(),
        };
        list.push(item);
        return {
          success: true,
          data: {
            message: `"${productName}" added to wishlist.`,
            item,
            totalItems: list.length,
          },
        };
      }

      case 'remove': {
        if (!productName) {
          return { success: false, error: 'productName is required for remove action' };
        }
        const before = list.length;
        const remaining = list.filter(
          i => i.productName.toLowerCase() !== productName.toLowerCase(),
        );
        wishlistStore.set(userId, remaining);
        const removed = before - remaining.length;
        return {
          success: true,
          data: {
            message: removed > 0
              ? `"${productName}" removed from wishlist.`
              : `"${productName}" was not found in wishlist.`,
            removed,
            totalItems: remaining.length,
          },
        };
      }

      case 'list': {
        if (list.length === 0) {
          return {
            success: true,
            data: { message: 'Your wishlist is empty.', items: [], totalItems: 0 },
          };
        }
        const totalValue = list.reduce((sum, i) => sum + (i.price ?? 0), 0);
        return {
          success: true,
          data: {
            items: list,
            totalItems: list.length,
            totalEstimatedValue: totalValue > 0 ? `$${totalValue.toFixed(2)} USD` : 'N/A',
          },
        };
      }

      case 'clear': {
        const count = list.length;
        wishlistStore.set(userId, []);
        return {
          success: true,
          data: {
            message: `Wishlist cleared. ${count} item${count !== 1 ? 's' : ''} removed.`,
            totalItems: 0,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }
}
