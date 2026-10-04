import { rpc } from '../../lib/api/client';
import type { PaymentDetail } from '../../lib/api/types';

/**
 * Payment provider abstraction (SPEC A5 flow 5). Today: manual Telebirr transfer + reference that an
 * admin confirms. A gateway (Telebirr API, Chapa, ArifPay) implements the same interface: `start`
 * returns a checkout URL and the webhook confirms server-side, so the Pay screen does not change.
 */
export interface PaymentInstructions {
  kind: 'manual_transfer' | 'redirect';
  accountNumber?: string;
  accountName?: string;
  checkoutUrl?: string;
}

export interface PaymentProvider {
  readonly id: string;
  instructions(payment: PaymentDetail): PaymentInstructions;
  /** Manual providers need a user-supplied reference; redirect providers do not. */
  readonly needsReference: boolean;
  submit(paymentId: string, reference: string, screenshotPath?: string): Promise<PaymentDetail>;
}

export const manualTelebirrProvider: PaymentProvider = {
  id: 'telebirr_manual',
  needsReference: true,
  instructions(payment) {
    return {
      kind: 'manual_transfer',
      accountNumber: payment.pay_to?.telebirr_number ?? '',
      accountName: payment.pay_to?.telebirr_name ?? '',
    };
  },
  submit(paymentId, reference, screenshotPath) {
    return rpc('submit_payment_reference', {
      p_payment_id: paymentId,
      p_reference: reference,
      ...(screenshotPath ? { p_screenshot_path: screenshotPath } : {}),
    });
  },
};

export function providerFor(_payment: PaymentDetail): PaymentProvider {
  return manualTelebirrProvider;
}
