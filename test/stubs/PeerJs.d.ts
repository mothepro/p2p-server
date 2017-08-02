// Correct Type definitions for PeerJS

type RTCPeerConnectionConfig = any
type RTCDataChannel = any

declare namespace PeerJs {
    export type peerID = string
    export type dcID = string

    interface PeerJSOption {
        logFunction?: (...args: any[]) => void
    }

    interface DataConnection {
        removeAllListeners: () => void
        id: string
    }
}