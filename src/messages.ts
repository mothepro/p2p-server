import * as Peer from 'peerjs'
import {register, registerError} from './Packer'

export class VersionError extends Error {
  clientVersion: string
  hostVersion: string
}
export class DirectMessage {
  constructor(public to: Peer.dcID, public data: any) {}

  static pack(dm: DirectMessage): [Peer.dcID, any] {
    return [dm.to, dm.data]
  }

  static unpack(data: [Peer.dcID, any]): DirectMessage {
    return new DirectMessage(data[0], data[1])
  }
}
export class BroadcastMessage {
  constructor(public readonly data: any) {}

  static pack(message: BroadcastMessage): any {
    return message.data
  }

  static unpack(data: any): BroadcastMessage {
    return new BroadcastMessage(data)
  }
}

registerError(0x1E, VersionError)
register(0x08, DirectMessage, DirectMessage.pack, DirectMessage.unpack)
register(0x09, BroadcastMessage, BroadcastMessage.pack, BroadcastMessage.unpack)
