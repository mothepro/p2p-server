// Correct Type definitions for PeerJS

type RTCPeerConnectionConfig = any
type RTCDataChannel = any

declare namespace PeerJs {
    interface PeerJSOption {
        logFunction: (...args: any[]) => void,
    }

    interface DataConnection {
        removeAllListeners: () => void,
        id: string,
    }

    // interface Peer {
    //     new (options: PeerJs.PeerJSOption): PeerJs.Peer
    // }
}