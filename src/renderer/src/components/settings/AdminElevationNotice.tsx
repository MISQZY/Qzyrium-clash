import { useTranslations } from '../../i18n'

export interface AdminElevationNoticeProps {
  restartingAdmin: boolean
  onRestartAsAdmin: () => void | Promise<void>
  className?: string
}

export function AdminElevationNotice({
  restartingAdmin,
  onRestartAsAdmin,
  className = ''
}: AdminElevationNoticeProps) {
  const t = useTranslations('networksettings')
  const common = useTranslations('common')

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning ${className}`}
    >
      <span className="min-w-0 flex-1 leading-relaxed">
        {t('tunAdminExplanation')}
      </span>
      <button
        type="button"
        disabled={restartingAdmin}
        onClick={() => void onRestartAsAdmin()}
        className="shrink-0 rounded bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-black transition-transform hover:opacity-90 active:scale-95 cursor-pointer"
      >
        {restartingAdmin ? common('restarting') || 'Restarting...' : common('restartAsAdministrator')}
      </button>
    </div>
  )
}
