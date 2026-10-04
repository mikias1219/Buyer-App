import { useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { updateSettings } from '../../lib/api/settings';

export function AdminSettings() {
  const { settings, setSettingsLocal, telegramId } = useAuth();
  const [fee, setFee] = useState(String(settings.listing_fee_etb));
  const [telebirrNumber, setTelebirrNumber] = useState(settings.telebirr_number);
  const [telebirrName, setTelebirrName] = useState(settings.telebirr_name);
  const [support, setSupport] = useState(settings.support_username);
  const [adminIds, setAdminIds] = useState(settings.admin_telegram_ids.join(', '));
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fieldClass =
    'w-full rounded-xl bg-[var(--tg-theme-bg-color,#efeff4)] px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#2481cc)]/40';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    const ids = adminIds
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    // Always keep current admin in the list
    if (!ids.includes(telegramId) && telegramId !== '0') {
      ids.push(telegramId);
    }

    const updated = await updateSettings({
      listing_fee_etb: Number(fee) || 0,
      telebirr_number: telebirrNumber.trim(),
      telebirr_name: telebirrName.trim(),
      support_username: support.trim().replace(/^@/, ''),
      admin_telegram_ids: ids,
    });

    setSaving(false);
    if (!updated) {
      setMsg('Save failed.');
      return;
    }
    setSettingsLocal(updated);
    setMsg('Settings saved.');
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#fff)] p-3"
    >
      <label className="block space-y-1">
        <span className="text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
          Listing fee (ETB)
        </span>
        <input
          type="number"
          min={0}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
          Telebirr number
        </span>
        <input
          value={telebirrNumber}
          onChange={(e) => setTelebirrNumber(e.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
          Telebirr account name
        </span>
        <input
          value={telebirrName}
          onChange={(e) => setTelebirrName(e.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
          Support username
        </span>
        <input
          value={support}
          onChange={(e) => setSupport(e.target.value)}
          className={fieldClass}
          placeholder="support"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
          Admin Telegram IDs (comma-separated)
        </span>
        <input
          value={adminIds}
          onChange={(e) => setAdminIds(e.target.value)}
          className={fieldClass}
          placeholder={telegramId}
        />
        <span className="block text-[11px] text-[var(--tg-theme-hint-color,#8e8e93)]">
          Your ID: {telegramId} (shown on Profile)
        </span>
      </label>

      {msg && <p className="text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">{msg}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-[var(--tg-theme-button-color,#2481cc)] py-3 text-[15px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}
