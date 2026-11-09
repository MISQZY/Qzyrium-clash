export interface GeoLocation {
  ip: string
  longitude: number
  latitude: number
  city: string
  country: string
  countryCode?: string
  precision?: 'city' | 'country'
}
export interface GeoRoute {
  node: string
  location: GeoLocation
}
export interface GlobeLocations {
  origin: GeoLocation | null
  routes: GeoRoute[]
  status?: 'ready' | 'origin-unavailable' | 'server-unavailable' | 'geoip-unavailable' | 'direct'
  pendingNodes?: string[]
}
