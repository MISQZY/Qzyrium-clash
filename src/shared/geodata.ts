export interface GeodataFile {
  name: string
  url: string
}

export const DEFAULT_GEODATA_FILES: readonly GeodataFile[] = [
  { name: 'country.mmdb', url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb' },
  { name: 'geosite.dat', url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat' },
  { name: 'geoip.dat', url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat' }
]

export const DEFAULT_GEOX_URLS: Record<'geoip' | 'geosite' | 'mmdb', string> = {
  geoip: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat',
  geosite: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
  mmdb: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb'
}
