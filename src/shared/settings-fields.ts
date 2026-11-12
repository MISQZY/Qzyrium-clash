export type ConfigValues = Record<string, unknown>
export interface SettingsField {
  key: string
  label: { en: string; ru: string }
  description?: { en: string; ru: string }
  type: 'boolean' | 'number' | 'text' | 'list' | 'map' | 'select'
  options?: readonly string[]
  min?: number
  max?: number
  placeholder?: string
}
const field = (key: string, en: string, ru: string, type: SettingsField['type'], extra: Partial<SettingsField> = {}): SettingsField => ({ key, label: { en, ru }, type, ...extra })
const desc = (en: string, ru: string) => ({ description: { en, ru } })
export const coreFields: SettingsField[] = [
  field('ipv6', 'IPv6', 'IPv6', 'boolean'),
  field('unified-delay', 'Unified delay', 'Единый расчёт задержки', 'boolean', desc(
    'Calculates latency using uniform RTT excluding local handshake overhead for cleaner comparisons.',
    'Исключает локальные задержки рукопожатия для точного и сопоставимого измерения пинга узлов.'
  )),
  field('tcp-concurrent', 'Concurrent TCP connections', 'Параллельные TCP-соединения', 'boolean', desc(
    'Sends TCP handshakes to all resolved IPs concurrently and uses the fastest responder.',
    'Параллельные TCP-рукопожатия ко всем IP адресам узла с выбором самого быстрого ответа.'
  )),
  field('find-process-mode', 'Process matching', 'Определение процессов', 'select', {
    options: ['always', 'strict', 'off'],
    ...desc(
      'Matches outgoing connections to specific applications for process-based routing rules.',
      'Определяет приложение-источник для маршрутизации трафика по правилам PROCESS-NAME.'
    )
  }),
  field('interface-name', 'Outbound interface', 'Исходящий интерфейс', 'text'),
  field('global-client-fingerprint', 'TLS client fingerprint', 'Отпечаток TLS-клиента', 'select', {
    options: ['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', '360', 'qq', 'random', 'randomized'],
    ...desc(
      'Simulates specific browser TLS signatures (JA3/JA4) to evade deep-packet inspection.',
      'Имитирует TLS Client Hello (JA3/JA4) популярных браузеров для обхода DPI-блокировок.'
    )
  }),
  field('disable-keep-alive', 'Disable TCP keep-alive', 'Отключить TCP keep-alive', 'boolean'),
  field('keep-alive-idle', 'Keep-alive idle (s)', 'Простой keep-alive (с)', 'number', { min: 0, max: 86400 }),
  field('keep-alive-interval', 'Keep-alive interval (s)', 'Интервал keep-alive (с)', 'number', { min: 0, max: 86400 }),
  field('port', 'HTTP port (0 disables)', 'HTTP-порт (0 — отключить)', 'number', { min: 0, max: 65535 }),
  field('socks-port', 'SOCKS5 port (0 disables)', 'SOCKS5-порт (0 — отключить)', 'number', { min: 0, max: 65535 }),
  field('bind-address', 'Bind address', 'Адрес прослушивания', 'text'),
  field('authentication', 'Proxy authentication (user:password)', 'Авторизация прокси (логин:пароль)', 'list'),
  field('skip-auth-prefixes', 'Skip authentication for CIDRs', 'CIDR без авторизации', 'list'),
  field('lan-allowed-ips', 'Allowed LAN CIDRs', 'Разрешённые CIDR в LAN', 'list'),
  field('lan-disallowed-ips', 'Blocked LAN CIDRs', 'Запрещённые CIDR в LAN', 'list')
]
export const tunFields: SettingsField[] = [
  field('auto-detect-interface', 'Detect outbound interface', 'Определять исходящий интерфейс', 'boolean', desc(
    'Automatically detects the active physical network interface for virtual routing.',
    'Автоматически определяет активный сетевой адаптер для корректной маршрутизации.'
  )),
  field('device', 'TUN device name', 'Имя TUN-интерфейса', 'text'),
  field('mtu', 'MTU', 'MTU', 'number', { min: 1280, max: 65535 }),
  field('udp-timeout', 'UDP timeout (s)', 'Тайм-аут UDP (с)', 'number', { min: 1, max: 86400 }),
  field('endpoint-independent-nat', 'Endpoint-independent NAT', 'Независимый от адреса NAT', 'boolean'),
  field('disable-icmp-forwarding', 'Disable ICMP forwarding', 'Отключить пересылку ICMP', 'boolean'),
  field('route-address', 'Included CIDRs', 'CIDR для маршрутизации', 'list'),
  field('route-exclude-address', 'Excluded CIDRs', 'Исключённые CIDR', 'list'),
  field('route-address-set', 'Included rule sets', 'Наборы правил для маршрутизации', 'list'),
  field('route-exclude-address-set', 'Excluded rule sets', 'Исключённые наборы правил', 'list'),
  field('include-interface', 'Included interfaces', 'Включённые интерфейсы', 'list'),
  field('exclude-interface', 'Excluded interfaces', 'Исключённые интерфейсы', 'list')
]
export const dnsFields: SettingsField[] = [
  field('enable', 'Enable DNS', 'Включить DNS', 'boolean'),
  field('listen', 'DNS listen address', 'Адрес DNS-сервера', 'text'),
  field('ipv6', 'Resolve IPv6', 'Разрешать IPv6', 'boolean'),
  field('ipv6-timeout', 'IPv6 timeout (ms)', 'Тайм-аут IPv6 (мс)', 'number', { min: 0, max: 60000 }),
  field('enhanced-mode', 'DNS mode', 'Режим DNS', 'select', {
    options: ['fake-ip', 'redir-host'],
    ...desc(
      'fake-ip assigns virtual IPs for instantaneous DNS resolution; redir-host queries real IP addresses.',
      'fake-ip выдаёт виртуальные IP для мгновенного ответа; redir-host запрашивает реальные IP-адреса.'
    )
  }),
  field('fake-ip-range', 'Fake-IP IPv4 range', 'Диапазон Fake-IP IPv4', 'text', desc(
    'Virtual IP subnet used to represent remote hostnames (e.g. 198.18.0.1/16).',
    'Пул виртуальных IP адресов для удалённых доменных имён (например, 198.18.0.1/16).'
  )),
  field('fake-ip-range6', 'Fake-IP IPv6 range', 'Диапазон Fake-IP IPv6', 'text'),
  field('fake-ip-filter-mode', 'Fake-IP filter mode', 'Режим фильтра Fake-IP', 'select', { options: ['blacklist', 'whitelist', 'rule'] }),
  field('fake-ip-filter', 'Fake-IP filter', 'Фильтр Fake-IP', 'list'),
  field('prefer-h3', 'Prefer HTTP/3', 'Предпочитать HTTP/3', 'boolean'),
  field('use-hosts', 'Use configured hosts', 'Использовать настроенные hosts', 'boolean'),
  field('use-system-hosts', 'Use system hosts', 'Использовать системный hosts', 'boolean'),
  field('respect-rules', 'Respect routing rules', 'Учитывать правила маршрутизации', 'boolean'),
  field('default-nameserver', 'Bootstrap DNS servers', 'Начальные DNS-серверы', 'list'),
  field('nameserver', 'DNS servers', 'DNS-серверы', 'list'),
  field('fallback', 'Fallback DNS servers', 'Резервные DNS-серверы', 'list'),
  field('proxy-server-nameserver', 'DNS for proxy servers', 'DNS для прокси-серверов', 'list'),
  field('direct-nameserver', 'DNS for direct connections', 'DNS для прямых соединений', 'list'),
  field('direct-nameserver-follow-policy', 'Apply policies to direct DNS', 'Применять политики к прямому DNS', 'boolean'),
  field('cache-algorithm', 'DNS cache algorithm', 'Алгоритм кеша DNS', 'select', {
    options: ['lru', 'arc'],
    ...desc(
      'LRU (Least Recently Used) or ARC (Adaptive Replacement Cache - more adaptive hit rate).',
      'LRU (простой список недавних) или ARC (адаптивный алгоритм с более высокой точностью попадания).'
    )
  }),
  field('nameserver-policy', 'DNS policies (YAML)', 'Политики DNS (YAML)', 'map'),
  field('fallback-filter', 'Fallback filter (YAML)', 'Фильтр резервного DNS (YAML)', 'map')
]
export const snifferFields: SettingsField[] = [
  field('enable', 'Enable sniffer', 'Включить Sniffer', 'boolean'),
  field('parse-pure-ip', 'Sniff IP-only connections', 'Анализировать соединения по IP', 'boolean'),
  field('override-destination', 'Override destination', 'Подменять адрес назначения', 'boolean'),
  field('force-dns-mapping', 'Force DNS mapping', 'Принудительное сопоставление DNS', 'boolean'),
  field('force-domain', 'Always sniff domains', 'Всегда анализировать домены', 'list'),
  field('skip-domain', 'Excluded domains', 'Исключённые домены', 'list'),
  field('skip-src-address', 'Excluded source CIDRs', 'Исключённые исходные CIDR', 'list'),
  field('skip-dst-address', 'Excluded destination CIDRs', 'Исключённые CIDR назначения', 'list'),
  field('sniff', 'HTTP / TLS / QUIC ports (YAML)', 'Порты HTTP / TLS / QUIC (YAML)', 'map', { placeholder: 'HTTP:\n  ports: [80, "8080-8880"]\nTLS:\n  ports: [443]\nQUIC:\n  ports: [443]' })
]
export const resourceFields: SettingsField[] = [
  field('geodata-mode', 'Use GeoIP DAT format', 'Использовать формат GeoIP DAT', 'boolean'),
  field('geodata-loader', 'Geodata loader', 'Загрузчик геоданных', 'select', {
    options: ['standard', 'memconservative'],
    ...desc(
      'memconservative significantly reduces memory footprint when loading GeoIP/GeoSite databases.',
      'memconservative заметно снижает потребление RAM при загрузке баз GeoIP/GeoSite.'
    )
  }),
  field('geo-auto-update', 'Update geodata automatically', 'Автоматически обновлять геоданные', 'boolean'),
  field('geo-update-interval', 'Geodata update interval (h)', 'Интервал обновления геоданных (ч)', 'number', { min: 1, max: 8760 }),
  field('geox-url', 'GeoIP / GeoSite / MMDB / ASN URLs (YAML)', 'Ссылки GeoIP / GeoSite / MMDB / ASN (YAML)', 'map'),
  field('profile', 'Cache selected nodes / Fake-IP (YAML)', 'Кеш выбранных узлов / Fake-IP (YAML)', 'map', { placeholder: 'store-selected: true\nstore-fake-ip: true' }),
  field('hosts', 'Custom hosts (YAML)', 'Пользовательские hosts (YAML)', 'map'),
  field('proxy-providers', 'Proxy providers (YAML)', 'Провайдеры прокси (YAML)', 'map'),
  field('rule-providers', 'Rule providers (YAML)', 'Провайдеры правил (YAML)', 'map')
]
export const generalFields: SettingsField[] = [
  field('reconnectAfterSleep', 'Recover connection after sleep', 'Восстанавливать подключение после сна', 'boolean', desc('Check the controller after wake-up and restart an unresponsive core only if it was connected before sleep.', 'Проверять контроллер после пробуждения и перезапускать не отвечающее ядро, если подключение работало до сна.')),
  field('resumeDelaySeconds', 'Recovery delay after wake-up (s)', 'Задержка восстановления после сна (с)', 'number', { min: 1, max: 120 }),
  field('updateProfilesOnStart', 'Update stale subscriptions at startup', 'Обновлять устаревшие подписки при запуске', 'boolean'),
  field('profileStartupMaxAgeHours', 'Subscription age before startup update (h)', 'Возраст подписки для обновления при запуске (ч)', 'number', { min: 1, max: 720 }),
  field('closeAction', 'When closing the window', 'При закрытии окна', 'select', { options: ['tray', 'quit', 'core-only'] }),
  ...(['app', 'connection'] as const).flatMap(source => {
    const en = source === 'app' ? 'Application logs' : 'Connection logs'
    const ru = source === 'app' ? 'Логи приложения' : 'Логи подключений'
    return [
      field(`${source}LogEnabled`, `${en}: save to disk`, `${ru}: запись на диск`, 'boolean'),
      field(`${source}LogMaxSizeMb`, `${en}: file size (MB)`, `${ru}: размер файла (МБ)`, 'number', { min: 1, max: 100 }),
      field(`${source}LogArchives`, `${en}: archive count`, `${ru}: число архивов`, 'number', { min: 0, max: 100 }),
      field(`${source}LogRetentionDays`, `${en}: retention (days)`, `${ru}: срок хранения (дни)`, 'number', { min: 1, max: 365 })
    ]
  }),
  field('autoStartAsAdmin', 'Start with administrator privileges', 'Запускать от имени администратора', 'boolean', desc(
    'When Windows startup is enabled, use Task Scheduler to start with administrator privileges. Windows may request confirmation when saving.',
    'При запуске вместе с Windows использовать планировщик задач для запуска с правами администратора. При сохранении Windows может запросить подтверждение.'
  )),
  field('autoCheckUpdates', 'Check for application updates automatically', 'Автоматически проверять обновления приложения', 'boolean', desc(
    'Check for updates when the application starts. Manual checks remain available.',
    'Проверять обновления при запуске приложения. Ручная проверка остаётся доступной.'
  )),
  field('lowMemoryMode', 'Reduce memory usage', 'Экономия памяти', 'boolean', desc(
    'Use lightweight interface rendering. Restart the application to apply.',
    'Облегчённая отрисовка интерфейса. Для применения нужен перезапуск приложения.'
  )),
  field('autoStart', 'Start with Windows', 'Запускать вместе с Windows', 'boolean', desc(
    'Launch the application automatically when logging into Windows.',
    'Автоматически запускать приложение при входе в Windows.'
  )),
  field('silentStart', 'Start in tray', 'Запускать в трее', 'boolean', desc(
    'Start the application minimized to the system tray.',
    'Запускать приложение свёрнутым в системный трей.'
  )),
  field('liteDashboard', 'Lightweight dashboard', 'Лёгкий режим главной', 'boolean', desc(
    'Hide 3D globe to reduce GPU and memory usage.',
    'Скрыть 3D-глобус для экономии ресурсов видеокарты и памяти.'
  )),
  field('onlyVpnTraffic', 'Count only VPN traffic', 'Учитывать только VPN-трафик', 'boolean', desc(
    'Display only proxied VPN traffic on the dashboard, excluding direct connections.',
    'Отображать на главной только трафик через VPN/прокси, исключая прямые соединения.'
  )),
  field('disableGpu', 'Disable GPU acceleration', 'Отключить ускорение GPU', 'boolean', desc(
    'Disable hardware graphics acceleration (restart required).',
    'Отключить аппаратное ускорение графики (нужен перезапуск).'
  )),
  field('autoCloseConnection', 'Close connections on node switch', 'Закрывать соединения при смене узла', 'boolean', desc(
    'Close active connections immediately when selecting another proxy.',
    'Принудительно закрывать активные соединения при смене прокси-узла.'
  )),
  field('connectionInterval', 'Connections refresh interval (ms)', 'Интервал обновления соединений (мс)', 'number', { min: 500, max: 60000 }),
  field('maxLogs', 'Log entries kept in memory', 'Количество записей журнала в памяти', 'number', { min: 100, max: 10000 }),
  field('delayTestUrl', 'Latency test URL', 'URL проверки задержки', 'text'),
  field('delayTestTimeout', 'Latency test timeout (ms)', 'Тайм-аут проверки задержки (мс)', 'number', { min: 100, max: 60000 }),
  field('delayTestConcurrency', 'Concurrent latency tests', 'Параллельные проверки задержки', 'number', { min: 1, max: 32 }),
  field('userAgent', 'Subscription User-Agent', 'User-Agent для подписок', 'text'),
  field('autoUpdateProfiles', 'Update subscriptions automatically', 'Автоматически обновлять подписки', 'boolean', desc(
    'Periodically update subscription profiles in background.',
    'Периодически обновлять подписки в фоновом режиме.'
  )),
  field('profileUpdateInterval', 'Subscription update interval (min)', 'Интервал обновления подписок (мин)', 'number', { min: 5, max: 10080 }),
  field('shortcuts', 'Global shortcuts', 'Глобальные горячие клавиши', 'map')
]

export function validateFields(values: ConfigValues | null | undefined, fields: readonly SettingsField[], name: string): void {
  if (values == null) return
  if (typeof values !== 'object' || Array.isArray(values)) throw new Error(`${name}: expected an object`)
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue
    const spec = fields.find((item) => item.key === key)
    if (!spec) throw new Error(`${name}.${key}: unsupported setting`)
    const error = () => { throw new Error(`${name}.${key}: invalid value`) }
    if (spec.type === 'boolean' && typeof value !== 'boolean') error()
    if (spec.type === 'number' && (typeof value !== 'number' || !Number.isInteger(value) || value < (spec.min ?? 0) || value > (spec.max ?? Number.MAX_SAFE_INTEGER))) error()
    if ((spec.type === 'text' || spec.type === 'select') && typeof value !== 'string') error()
    if (spec.type === 'select' && !spec.options?.includes(value as string)) error()
    if (spec.type === 'list' && (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string'))) error()
    if (spec.type === 'map' && (!value || typeof value !== 'object' || Array.isArray(value))) error()
  }
}
