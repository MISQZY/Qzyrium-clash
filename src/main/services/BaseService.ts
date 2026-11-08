export interface BaseService {
  initialize(): Promise<void>
  dispose(): Promise<void>
}
