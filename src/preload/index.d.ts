import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI & {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>
        on: (channel: string, callback: (event: any, ...args: any[]) => void) => () => void
        removeAllListeners: (channel: string) => void
      }
    }
  }
}