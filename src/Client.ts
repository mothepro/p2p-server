import EventEmitter from 'typed-event-emitter-2'
import * as Peer from 'peerjs'
import {pack, unpack} from './Packer'
import {BroadcastMessage, DirectMessage, VersionError} from './messages'

export default class Client extends EventEmitter<
	'connection' | 'disconnection' | // Emitted by Client on {,dis}connection with Server.
	'online' | 'offline' | // Emitted on {,dis}connection with brokering server.
	'start' | 'quit' | // Emitted when starting / closing Peer connection.
	'clientUpdate', // Emitted by Server when a client {,dis}connects.
	{
		error: Error, // Emitted on error.
		data: { // Emitted when data is received.
			from: Peer.dcID | '' // | Peer.DataConnection, // For now, let's only emit the connection ID
			data: any,
		},
		ready: Peer.peerID, // Emitted when the Server is ready to accept Clients.
		clientConnection: Peer.DataConnection, // Emitted by Server when a client connects.
		clientDisconnection: Peer.DataConnection, // Emitted by Server when a client disconnects.
	}> {

	public peer: Peer
	public host: Peer.DataConnection

	private stopping: boolean = false

	protected onPeerOpen(version: string, hostID: Peer.peerID) {
		return (id: Peer.peerID) => {
            this.emit('online')
			this.connect({version, hostID})
        }
	}
	protected onPeerClose() { return this.quit() }
	protected onPeerError(e: Error) { return this.errorHandler(e) }
	protected onPeerDisconnect() { return this.emit('offline') }

	/**
	 * Create a host as a server to other clients.
	 */
	constructor({key, version, hostID, logger, options = { secure: false }}: {
		key: string, // a Peer JS API key.
		version: string, // version of top package, to make sure host and client are in sync.
		hostID: Peer.peerID, // peer id of host to connect to.
		logger?: typeof Client.prototype.log, // optional method to log info.
		options?: Peer.PeerJSOption, // Extra PeerJS options
	}) {
		super()

		if (logger) {
			this.log = logger
			options = {
				...options,
				debug: 3,
				logFunction: this.log.bind(this, 'peerjs'),
			}
		}
		options.key = key

		this.peer = new Peer(Client.randomID(), options)
		this.peer.on('open', this.onPeerOpen(version, hostID))
        this.peer.on('error', this.onPeerError)
        this.peer.on('close', this.onPeerClose)
        this.peer.on('disconnected', this.onPeerDisconnect)
	}

	/**
	 * Handle errors with the peer.
	 */
	protected errorHandler(e: Error): void {
		// Handle errors with the connection to the host.
		if ((<any>e).type === 'peer-unavailable') {
			this.log('Unable to connect to the host. Make a new instance, or reload')
			this.quit()
		} else if (e instanceof VersionError) {
			this.log(e.message)
			this.host.removeAllListeners()
			this.emit('disconnection') // because we emitted 'connection'
			this.quit()
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
	 */
	protected connect({version, hostID}: {
		version: string // version of top package, to make sure host and client are in sync.
		hostID: Peer.peerID // id of host to connect to.
	}): void {
		this.host = this.peer.connect(hostID, {metadata: {version}})
		this.host.on('error', this.errorHandler.bind(this))
		this.host.on('close', this.disconnect.bind(this))
		this.host.on('open', this.connection.bind(this))
		this.host.on('data', data => this.receive(unpack(data)))
	}

	/**
	 * Connected to host, leave the server
	 */
	protected connection(): void {
		this.emit('connection')
		this.peer.disconnect()
	}

	/**
	 * Receive some data from the host. (Message or DirectMessage)
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
	 * @param to Connection to send to, leave empty for host
	 */
	send(data: any, to?: Peer.dcID): void {
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
	broadcast(data: any, alsoReceive = true): void {
		this.host.send(pack(new BroadcastMessage(data)))
		// TODO Where should the data be "from" if I broadcasted it???
		if(alsoReceive)
			this.receive(data)
		this.log(alsoReceive ? 'broadcasting' : 'forwarding', data)
	}

	/**
	 * Disconnected from the host.
	 * Can try to reconnect to the server, then to the host again.
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
	 */
	protected quit(): void {
		if(!this.peer.destroyed && !this.stopping) {
			this.stopping = true
			this.peer.destroy()
			this.emit('quit')
		}
	}

    /**
     * Generate a short random id, length is always 7.
     */
    private static randomID(): Peer.peerID {
        let num = (new Date).getTime()
        num += Math.random()
        num *= 100
        const ret = <string>Math.floor(num).toString(36) // base 36
        return ret.substr(3, 7) // remove repetition
    }
}
