import React, { ReactElement, createContext, useEffect, useState, useCallback, useRef } from 'react'
import { Provider as AlertProvider } from 'react-alert'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import { AlertTemplate, options } from '@site/src/components/Alert'
import { createEVMClient, MetamaskConnectEVM, EIP1193Provider } from '@metamask/connect-evm'
import { REF_ALLOW_LOGIN_PATH, REQUEST_PARAMS } from '@site/src/lib/constants'
import {
  clearStorage,
  getUserIdFromJwtToken,
  saveTokenString,
  getTokenString,
  getUksTier,
  AUTH_WALLET_PROJECTS,
  AUTH_WALLET_ENS,
  getWalletEns,
} from '@site/src/lib/siwsrp/auth'
import AuthModal, {
  AUTH_LOGIN_STEP,
  WALLET_LINK_TYPE,
} from '@site/src/components/AuthLogin/AuthModal'
import { getInfuraRpcUrls } from '@metamask/connect-evm'

interface Project {
  id: string
  userId: string
  name: string
  created: number
  updated: number
  deleted: boolean
  settings: any
  networks: {
    [key: string]: { subnets: number[] }
  }
  role: string
}

interface IMetamaskProviderContext {
  token: string
  projects: { [key: string]: Project }
  setProjects: (arg: { [key: string]: Project }) => void
  metaMaskDisconnect: () => Promise<void>
  metaMaskWalletIdConnectHandler: () => Promise<void>
  userId: string | undefined
  metaMaskAccount: string
  metaMaskAccountEns: string
  setMetaMaskAccount: (arg: string[] | string) => void
  metaMaskProvider: EIP1193Provider
  setMetaMaskProvider: (arg: EIP1193Provider) => void
  uksTier: string
  client: MetamaskConnectEVM | null
  setNeedsMfa: (arg: boolean) => void
  needsMfa: boolean
  setWalletLinked: (arg: WALLET_LINK_TYPE) => void
  walletLinked: WALLET_LINK_TYPE | undefined
  setWalletAuthUrl: (arg: string) => void
  walletAuthUrl: string
  userAPIKey?: string
  setUserAPIKey?: (key: string) => void
  fetchLineaEns?: (walletId: string) => Promise<void>
  userEncPublicKey?: string
  setUserEncPublicKey?: (key: string) => void
}

export const MetamaskProviderContext = createContext<IMetamaskProviderContext>({
  token: undefined,
  projects: {},
  setProjects: () => {},
  metaMaskDisconnect: () => new Promise(() => {}),
  metaMaskWalletIdConnectHandler: () => new Promise(() => {}),
  userId: undefined,
  metaMaskAccount: undefined,
  metaMaskAccountEns: undefined,
  setMetaMaskAccount: () => {},
  uksTier: undefined,
  metaMaskProvider: undefined,
  setMetaMaskProvider: () => {},
  client: null,
  setNeedsMfa: () => {},
  needsMfa: false,
  setWalletLinked: () => {},
  walletLinked: undefined,
  setWalletAuthUrl: () => {},
  walletAuthUrl: '',
  userAPIKey: '',
  setUserAPIKey: () => {},
  fetchLineaEns: () => new Promise(() => {}),
  userEncPublicKey: undefined,
  setUserEncPublicKey: () => {},
})

export const LoginProvider = ({ children }) => {
  const [projects, setProjects] = useState({})
  const [userId, setUserId] = useState<string>('')
  const [token, setToken] = useState<string>(undefined)
  const [openAuthModal, setOpenAuthModal] = useState<boolean>(false)
  const [metaMaskProvider, setMetaMaskProvider] = useState<EIP1193Provider>(undefined)
  const [metaMaskAccount, setMetaMaskAccount] = useState(undefined)
  const [metaMaskAccountEns, setMetaMaskAccountEns] = useState(undefined)
  const [uksTier, setUksTier] = useState(undefined)
  const [client, setClient] = useState<MetamaskConnectEVM | null>(null)
  const clientInitialized = useRef(false)
  const [step, setStep] = useState<AUTH_LOGIN_STEP>(AUTH_LOGIN_STEP.CONNECTING)
  const [walletLinked, setWalletLinked] = useState<WALLET_LINK_TYPE | undefined>(undefined)
  const [needsMfa, setNeedsMfa] = useState<boolean>(false)
  const [walletAuthUrl, setWalletAuthUrl] = useState<string>('')
  const [userAPIKey, setUserAPIKey] = useState('')
  const [userEncPublicKey, setUserEncPublicKey] = useState(undefined)
  const { siteConfig } = useDocusaurusContext()
  const { DASHBOARD_URL, LINEA_ENS_URL } = siteConfig?.customFields || {}

  useEffect(() => {
    if (clientInitialized.current) return
    clientInitialized.current = true
    createEVMClient({
      dapp: {
        name: 'MetaMask Developer Documentation',
        url: 'https://docs.metamask.io/',
      },
      api: {
        supportedNetworks: {
          ...getInfuraRpcUrls({ infuraApiKey: 'INFURA_API_KEY' }),
        },
      },
    }).then(instance => {
      setClient(instance)
      setMetaMaskProvider(instance.getProvider())
    })
  }, [])

  const fetchLineaEns = async (rawAddress: string) => {
    if (getWalletEns()) {
      setMetaMaskAccountEns(getWalletEns())
    } else if (rawAddress) {
      const address = String(rawAddress).toLowerCase()
      try {
        const res = await (
          await fetch(LINEA_ENS_URL as string, {
            ...REQUEST_PARAMS('POST'),
            body: JSON.stringify({
              query: `query getNamesForAddress {domains(first: 1, where: {and: [{or: [{owner: \"${address}\"}, {registrant: \"${address}\"}, {wrappedOwner: \"${address}\"}]}, {parent_not: \"0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2\"}, {or: [{expiryDate_gt: \"1721033912\"}, {expiryDate: null}]}, {or: [{owner_not: \"0x0000000000000000000000000000000000000000\"}, {resolver_not: null}, {and: [{registrant_not: \"0x0000000000000000000000000000000000000000\"}, {registrant_not: null}]}]}]}) {...DomainDetailsWithoutParent}} fragment DomainDetailsWithoutParent on Domain {name}`,
            }),
          })
        ).json()
        const walletEns = res.data.domains[0].name
        setMetaMaskAccountEns(walletEns)
        sessionStorage.setItem(AUTH_WALLET_ENS, walletEns)
      } catch (e) {
        setMetaMaskAccountEns(undefined)
      }
    }
  }

  const getStaleDate = async () => {
    if (!client) return
    try {
      setProjects(JSON.parse(sessionStorage.getItem(AUTH_WALLET_PROJECTS) || '{}'))
      setUserId(getUserIdFromJwtToken())
      setToken(getTokenString())
      setUksTier(getUksTier())
      setMetaMaskAccountEns(getWalletEns())
      // Sepolia and Linea Sepolia
      const { accounts } = await client.connect({ chainIds: ['0xaa36a7', '0xe705'] })
      if (accounts && accounts.length > 0) {
        setMetaMaskAccount(accounts[0])
        setMetaMaskProvider(client.getProvider())
      }
    } catch (e) {}
  }

  const metaMaskWalletIdConnectHandler = useCallback(async () => {
    try {
      setOpenAuthModal(true)
    } catch (err) {
      console.warn('failed to connect..', err)
    }
  }, [setOpenAuthModal])

  const metaMaskDisconnect = useCallback(async () => {
    try {
      await client?.disconnect()
      setOpenAuthModal(false)
      setUserId(undefined)
      setToken(undefined)
      setMetaMaskAccount(undefined)
      setMetaMaskAccountEns(undefined)
      setUksTier(undefined)
      setProjects({})
      setWalletLinked(undefined)
      setNeedsMfa(false)
      setUserAPIKey('')
      clearStorage()
    } catch (err) {
      console.warn('failed to disconnect..', err)
    }
  }, [client, setOpenAuthModal, setUserId, setToken, setMetaMaskAccount, setUksTier, setProjects])

  useEffect(() => {
    if (!client) return
    const url = new URL(window.location.href)
    getStaleDate()
    if (REF_ALLOW_LOGIN_PATH.some(item => url.pathname.includes(item))) {
      const token = url.searchParams.get('token')

      if (token) {
        saveTokenString(token)
        setToken(token)
        const userIdFromjwtToken = getUserIdFromJwtToken()
        setUserId(userIdFromjwtToken)
        ;(async () => {
          try {
            const projectsResponse = await fetch(
              `${DASHBOARD_URL}/api/v1/users/${userIdFromjwtToken}/projects`,
              {
                ...REQUEST_PARAMS('GET', { Authorization: `Bearer ${token}` }),
              }
            )
            const res = await projectsResponse.json()
            if (res.error) throw new Error(res.error.message)

            const {
              result: { projects },
            } = res
            sessionStorage.setItem(AUTH_WALLET_PROJECTS, JSON.stringify(projects))
            setProjects(projects)
            window.location.replace(`${url.origin}${url.pathname}`)
          } catch (e: any) {
            setStep(AUTH_LOGIN_STEP.CONNECTION_ERROR)
            setOpenAuthModal(true)
          }
        })()
      }
    }
  }, [client])

  return (
    <MetamaskProviderContext.Provider
      value={
        {
          token,
          metaMaskAccount,
          metaMaskAccountEns,
          setMetaMaskAccount,
          projects,
          setProjects,
          metaMaskDisconnect,
          metaMaskWalletIdConnectHandler,
          userId,
          metaMaskProvider,
          uksTier,
          setMetaMaskProvider,
          client,
          walletLinked,
          setWalletLinked,
          needsMfa,
          setNeedsMfa,
          walletAuthUrl,
          setWalletAuthUrl,
          userAPIKey,
          setUserAPIKey,
          fetchLineaEns,
          userEncPublicKey,
          setUserEncPublicKey,
        } as IMetamaskProviderContext
      }>
      {children}
      <AuthModal
        open={openAuthModal}
        setOpen={setOpenAuthModal}
        setUser={setUserId}
        setToken={setToken}
        setUksTier={setUksTier}
        setStep={setStep}
        step={step}
      />
    </MetamaskProviderContext.Provider>
  )
}

export default function Root({ children }: { children: ReactElement }) {
  return (
    <LoginProvider>
      <AlertProvider template={AlertTemplate} {...options}>
        {children}
      </AlertProvider>
    </LoginProvider>
  )
}
