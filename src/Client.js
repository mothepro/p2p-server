import Peer from 'peerjs'
import EventEmitter from 'events'
import {encode, decode, createCodec} from 'msgpack-lite'

// Override codecs for Map's and Errors
const codec = createCodec()
codec.addExtPacker(0x1C, Map, [map => [...map], encode])
codec.addExtUnpacker(0x1C, [decode, entries => new Map(entries)])

codec.addExtPacker(0x0E, Error, errData => {
	const obj = Object.assign({}, errData)
	obj.message = errData.message
	return encode(errData)
})
codec.addExtUnpacker(0x0E, data => {
	const errData = decode(data)
	const error = Error(errData.message)

	for(const key of Object.keys(errData))
		error[key] = errData[key]

	return error
})

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
	}) {
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
		} else if (e.name === 'version') {
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
			}
		})
		this.host.on('error', this.errorHandler.bind(this))
		this.host.on('close', this.disconnect.bind(this))
		this.host.on('open', this.connection.bind(this))
		this.host.on('data', this.receive.bind(this))
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
	 * Receive some data from the host.
	 *
	 * @param data
	 * @protected
	 * @event data
	 */
	receive(data) {
		const decodedData = decode(data, {codec})

		if (decodedData instanceof Error)
			this.errorHandler(decodedData)
		else if (typeof decodedData === 'object' && '__from' in decodedData)
			this.emit('data', {
				from: decodedData.__from,
				data: decodedData.data,
			})
		else
			this.emit('data', {
				from: this.host.id,
				data: decodedData,
			})
	}

	/**
	 * Send data to the host.
	 *
	 * @param data
	 * @param {?string} to Connection to send to, leave empty for host
	 */
	send(data, to = null) {
		if(to)
			data = {
				data,
				__to: to,
			}

		const encodedData = encode(data, {codec})

		this.host.send(encodedData)
		this.log('sending', encodedData)
	}

	/**
	 * Tell the host to broadcast this message.
	 * Then, receive it for myself.
	 * @param data
	 */
	broadcast(data) {
		this.host.send(encode({
			data,
			__to: true,
		}), {codec})
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
