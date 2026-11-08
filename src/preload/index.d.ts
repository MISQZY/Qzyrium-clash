import { IElectronApi } from '@shared/ipc'

declare global {
  interface Window {
    api: IElectronApi
  }
}
