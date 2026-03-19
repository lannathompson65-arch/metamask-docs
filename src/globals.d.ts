declare module '*.svg' {
  import { FC, SVGProps } from 'react'
  const content: FC<SVGProps<SVGElement>>
  export default content
}

// The @metamask/connect-evm package exports `createEVMClient` at runtime
// but its type declarations name it `createMetamaskConnectEVM`.
declare module '@metamask/connect-evm' {
  export { MetamaskConnectEVM, EIP1193Provider } from '@metamask/connect-evm'
  export function createEVMClient(options: {
    dapp: { name: string; url: string; iconUrl?: string }
    api?: { supportedNetworks?: Record<string, string> }
    eventHandlers?: Record<string, (...args: unknown[]) => void>
    debug?: boolean
  }): Promise<import('@metamask/connect-evm').MetamaskConnectEVM>
}
