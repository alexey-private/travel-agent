import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';

type AlertAction = 'create' | 'list' | 'delete' | 'check';

interface PriceAlertInput {
  action: AlertAction;
  userId: string;
  productName?: string;
  targetPrice?: number;
  currentPrice?: number;
  productUrl?: string;
  alertId?: string;
}

interface PriceAlert {
  id: string;
  productName: string;
  targetPrice: number;
  currentPrice?: number;
  productUrl: string;
  createdAt: string;
  triggered: boolean;
  lastChecked: string;
}

// In-memory store keyed by userId
const alertStore = new Map<string, PriceAlert[]>();

let idCounter = 1000;
function nextId(): string {
  return `alert_${(idCounter++).toString()}`;
}

function simulatePriceCheck(alert: PriceAlert): { currentPrice: number; dropped: boolean } {
  // Deterministic mock: simulate slight price fluctuation based on alert id
  let h = 2166136261;
  for (let i = 0; i < alert.id.length; i++) {
    h ^= alert.id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = ((h >>> 0) / 4294967296);
  const base = alert.currentPrice ?? alert.targetPrice * 1.2;
  const variance = (rand - 0.5) * 0.3;
  const simulatedPrice = Math.round(base * (1 + variance) * 100) / 100;
  return {
    currentPrice: simulatedPrice,
    dropped: simulatedPrice <= alert.targetPrice,
  };
}

export class PriceAlertTool extends BaseTool {
  readonly name = 'manage_price_alerts';
  readonly description =
    'Create and manage price drop alerts for products. Get notified (simulated) when a product price falls below a target. ' +
    'Use when the user wants to track a price, set up a price alert, check if a price dropped, or manage their existing alerts.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'delete', 'check'],
        description: '"create" a new alert, "list" all alerts, "delete" an alert by id, or "check" current prices for all alerts',
      },
      userId: {
        type: 'string',
        description: 'User identifier to scope the alerts',
      },
      productName: {
        type: 'string',
        description: 'Product name to track (required for create)',
      },
      targetPrice: {
        type: 'number',
        description: 'Alert me when price drops to or below this amount in USD (required for create)',
      },
      currentPrice: {
        type: 'number',
        description: 'Current product price in USD (optional, used to initialize tracking)',
      },
      productUrl: {
        type: 'string',
        description: 'Product URL or store link (optional)',
      },
      alertId: {
        type: 'string',
        description: 'Alert ID to delete (required for delete)',
      },
    },
    required: ['action', 'userId'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { action, userId, productName, targetPrice, currentPrice, productUrl, alertId } = input as PriceAlertInput;

    if (!alertStore.has(userId)) {
      alertStore.set(userId, []);
    }
    const alerts = alertStore.get(userId)!;

    switch (action) {
      case 'create': {
        if (!productName || targetPrice === undefined) {
          return { success: false, error: 'productName and targetPrice are required for create action' };
        }
        const now = new Date().toISOString();
        const alert: PriceAlert = {
          id: nextId(),
          productName,
          targetPrice,
          currentPrice,
          productUrl: productUrl ?? '',
          createdAt: now,
          triggered: false,
          lastChecked: now,
        };
        alerts.push(alert);
        const savings = currentPrice && currentPrice > targetPrice
          ? `$${(currentPrice - targetPrice).toFixed(2)} USD`
          : undefined;
        return {
          success: true,
          data: {
            message: `Price alert created for "${productName}". You'll be notified when the price drops to $${targetPrice} or below.`,
            alert,
            potentialSavings: savings,
          },
        };
      }

      case 'list': {
        if (alerts.length === 0) {
          return { success: true, data: { message: 'No active price alerts.', alerts: [], total: 0 } };
        }
        return {
          success: true,
          data: { alerts, total: alerts.length },
        };
      }

      case 'delete': {
        if (!alertId) {
          return { success: false, error: 'alertId is required for delete action' };
        }
        const before = alerts.length;
        const remaining = alerts.filter(a => a.id !== alertId);
        alertStore.set(userId, remaining);
        const deleted = before - remaining.length;
        return {
          success: true,
          data: {
            message: deleted > 0 ? `Alert ${alertId} deleted.` : `Alert ${alertId} not found.`,
            deleted,
            remaining: remaining.length,
          },
        };
      }

      case 'check': {
        if (alerts.length === 0) {
          return { success: true, data: { message: 'No active price alerts to check.', results: [] } };
        }
        const now = new Date().toISOString();
        const results = alerts.map(alert => {
          const { currentPrice: checked, dropped } = simulatePriceCheck(alert);
          alert.currentPrice = checked;
          alert.lastChecked = now;
          if (dropped) alert.triggered = true;
          return {
            id: alert.id,
            productName: alert.productName,
            targetPrice: alert.targetPrice,
            currentPrice: checked,
            dropped,
            savings: dropped ? `$${(checked - alert.targetPrice).toFixed(2)} below target` : undefined,
            status: dropped ? '🎉 Price target reached!' : `Still $${(checked - alert.targetPrice).toFixed(2)} above target`,
          };
        });
        const triggered = results.filter(r => r.dropped);
        return {
          success: true,
          data: {
            results,
            summary: triggered.length > 0
              ? `${triggered.length} alert(s) triggered! Check the results above.`
              : 'No price targets reached yet. Keep watching!',
            checkedAt: now,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }
}
