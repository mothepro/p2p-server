import Peer from 'peerjs'
import EventEmitter from 'events'
import {pack, unpack, register, registerError} from './Packer'

export class VersionError extends Error {}

export class DirectMessage {
	constructor(to, data) {
		this.data = data
		this.to = to
	}

	static pack(dm) {
		return [dm.to, dm.data]
	}

	static unpack(data) {
		return new DirectMessage(data[0], data[1])
	}
}
export class BroadcastMessage {
	constructor(data) {
		this.data = data
	}

	static pack(message) {
		return message.data
	}

	static unpack(data) {
		return new BroadcastMessage(data)
	}
}

registerError(0x1E, VersionError)
register(0x08, DirectMessage, DirectMessage.pack, DirectMessage.unpack)
register(0x09, BroadcastMessage, BroadcastMessage.pack, BroadcastMessage.unpack)

/**
 * @fires error
 * @fires ready
 * @fires quit
 * @fires connection
 * @fires disconnection
 * @fires data
 */
export default class Client extends EventEmitter {
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
	} = {}) {
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
	 * @param {string} version version of top package, to make sure host and client are in sync.
	 * @param {string} hostID peer id of host to connect to.
	 * @param options for the Peer constructor.
	 * @protected
	 * @event connection
	 */
	makePeer({version, hostID, options}) {
		/** @type {Peer} */
		this.peer = new Peer(options)
		this.peer.on('error', this.errorHandler.bind(this))
		this.peer.on('close', this.quit.bind(this))
		this.peer.on('open', id => this.ready({id, version, hostID}))
	}

	/**
	 * Handle errors with the peer.
	 *
	 * @param {Error} e the error
	 * @protected
	 * @event error
	 * @event disconnection
	 */
	errorHandler(e) {
		// Handle errors with the connection to the host.
		if (e.type === 'peer-unavailable') {
			this.log('Unable to connect to the host. Make a new instance, or reload')
			this.quit()
		} else if (e instanceof VersionError) {
			this.log(e.message)
			// Close if I am a client
			if(typeof this.clients === 'undefined') {
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
	log() {}

	/**
	 * When an ID is generated.
	 * Connect to the host. Then disconnect from the server.
	 *
	 * @param id {string} generated peer id for client.
	 * @param version {string} version of top package, to make sure host and client are in sync.
	 * @param hostID {string} peer id of host to connect to.
	 * @protected
	 * @event ready
	 */
	ready({id, version, hostID}) {
		/** @type {DataConnection} */
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
	connection() {
		this.peer.disconnect()
		this.emit('connection')
	}

	/**
	 * Receive some data from the host. (Message or DirectMessage)
	 *
	 * @param data
	 * @protected
	 * @event data
	 */
	receive(data) {
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
	send(data, to = null) {
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
	 * @param data
	 */
	broadcast(data) {
		this.host.send(pack(new BroadcastMessage(data)))
		// TODO Where should the data be "from" if I broadcasted it???
		this.receive(data)
		this.log('broadcasting', data)
	}

	/**
	 * Disconnected from the host.
	 * Can try to reconnect to the server, then to the host again.
	 * @protected
	 * @event disconnection
	 */
	disconnect() {
		this.emit('disconnection')
		this.peer.reconnect()

		// can't connect to server
		if(this.peer.disconnected)
			this.quit()
	}

	/**
	 * Peer is destroyed and can no longer accept or create any new connections.
	 * At this time, the peer's connections will all be closed.
	 * @protected
	 * @event quit
	 */
	quit() {
		if(!this.peer.destroyed && !this.stopping) {
			this.stopping = true
			this.peer.destroy()
			this.emit('quit')
		}
	}
}
