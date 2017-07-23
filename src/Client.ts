///<reference path="../test/stubs/PeerJs.d.ts" />
const Peer = require('peerjs')
import * as EventEmitter from 'events'
import {pack, unpack, register, registerError} from './Packer'

export class VersionError extends Error {}

export class DirectMessage {
	constructor(public to: string, public data: any) {}

	static pack(dm): [string, any] {
		return [dm.to, dm.data]
	}

	static unpack(data): DirectMessage {
		return new DirectMessage(data[0], data[1])
	}
}
export class BroadcastMessage {
	constructor(public readonly data: any) {}

	static pack(message: any): any {
		return message.data
	}

	static unpack(data: any): BroadcastMessage {
		return new BroadcastMessage(data)
	}
}

registerError(0x1E, VersionError)
register(0x08, DirectMessage, DirectMessage.pack, DirectMessage.unpack)
register(0x09, BroadcastMessage, BroadcastMessage.pack, BroadcastMessage.unpack)

type peerID = string
type dcID = string

/**
 * @fires error
 * @fires ready
 * @fires quit
 * @fires connection
 * @fires disconnection
 * @fires data
 */
export default class Client extends EventEmitter {
	public peer: PeerJs.Peer
	public host: PeerJs.DataConnection

	private stopping: boolean = false

	/**
	 * Create a host as a server to other clients.
	 *
	 * @param {string} key a Peer JS API key.
	 * @param {string} version version of top package, to make sure host and client are in sync.
	 * @param {string} hostID peer id of host to connect to.
	 * @param {Function=} logger optional method to log info.
	 * @param {Object=} options
	 */
	constructor({
		key,
		version,
		hostID,
		logger = null,
		options = {
			secure: false,
		},
	}: {
		key?: string,
		version?: string,
		hostID?: peerID,
		logger?: (...args: any[]) => void,
		options?: any
	} = <any>{}) {
		super()

		if (typeof logger === 'function') {
			this.log            = logger
			options.debug       = 3
			options.logFunction = this.log.bind(this, 'peerjs')
		}
		options.key = key

		this.makePeer({version, hostID, options})
	}

	/**
	 * Creates the peer.
	 *
	 * @param version version of top package, to make sure host and client are in sync.
	 * @param hostID peer id of host to connect to.
	 * @param options for the Peer constructor.
	 * @event connection
	 */
	protected makePeer({version, hostID, options}: {version: string, hostID: peerID, options: PeerJs.PeerJSOption}): void {
		this.peer = new Peer(<PeerJs.PeerJSOption>options)
		this.peer.on('error', this.errorHandler.bind(this))
		this.peer.on('close', this.quit.bind(this))
		this.peer.on('open', id => this.ready({id, version, hostID}))
	}

	/**
	 * Handle errors with the peer.
	 * @event error disconnection
	 */
	protected errorHandler(e: Error | any): void {
		// Handle errors with the clitentConnection to the host.
		if (e.type === 'peer-unavailable') {
			this.log('Unable to connect to the host. Make a new instance, or reload')
			this.quit()
		} else if (e instanceof VersionError) {
			this.log(e.message)
			// Close if I am a client
			if('clients' in this) {
				this.host.removeAllListeners()
				this.emit('disconnection') // because we emitted 'connection'
				this.quit()
			}
		}

		this.emit('error', e)
	}

	/**
	 * Logs info, empty by default.
	 */
	log(...args: any[]): void {}

	/**
	 * When an ID is generated.
	 * Connect to the host. Then disconnect from the server.
	 *
	 * @param id generated peer id for client.
	 * @param version version of top package, to make sure host and client are in sync.
	 * @param hostID peer id of host to connect to.
	 * @event ready
	 */
	protected ready({id, version, hostID}: {id: peerID, version: string, hostID: peerID}): void {
		this.host = this.peer.connect(hostID, {
			metadata: {
				version,
			},
			serialization: 'none',
		})
		this.host.on('error', this.errorHandler.bind(this))
		this.host.on('close', this.disconnect.bind(this))
		this.host.on('open', this.connection.bind(this))
		this.host.on('data', data => this.receive(unpack(data)))
		this.emit('ready')
	}

	/**
	 * Connected to host, leave the server
	 */
	protected connection(): void {
		this.peer.disconnect()
		this.emit('connection')
	}

	/**
	 * Receive some data from the host. (Message or DirectMessage)
	 * @event data
	 */
	protected receive(data: Error | DirectMessage | any): void {
		if (data instanceof Error)
			this.errorHandler(data)
		else if (data instanceof DirectMessage)
			this.emit('data', {
				from: data.to,
				data: data.data,
			})
		else
			this.emit('data', {
				from: this.host.id,
				data,
			})
	}

	/**
	 * Send data to the host.
	 * Sends a Message or DirectMessage
	 * @param data
	 * @param {?string} to Connection to send to, leave empty for host
	 */
	send(data, to?: dcID): void {
		let message = data

		if(to)
			message = new DirectMessage(to, data)

		this.host.send(pack(message))
		this.log('sending', data)
	}

	/**
	 * Tell the host to broadcast this message.
	 * Then, receive it for myself.
	 * Sends a BroadcastMessage
	 */
	broadcast(data: any): void {
		this.host.send(pack(new BroadcastMessage(data)))
		// TODO Where should the data be "from" if I broadcasted it???
		this.receive(data)
		this.log('broadcasting', data)
	}

	/**
	 * Disconnected from the host.
	 * Can try to reconnect to the server, then to the host again.
	 * @event disconnection
	 */
	protected disconnect(): void {
		this.emit('disconnection')
		this.peer.reconnect()

		// can't connect to server
		if(this.peer.disconnected)
			this.quit()
	}

	/**
	 * Peer is destroyed and can no longer accept or create any new connections.
	 * At this time, the peer's connections will all be closed.
	 * @event quit
	 */
	protected quit(): void {
		if(!this.peer.destroyed && !this.stopping) {
			this.stopping = true
			this.peer.destroy()
			this.emit('quit')
		}
	}
}
