import Peer from 'peerjs'

export default class Client {
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
		logger,
		options = {
			secure: false,
		},
	}) {
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
	 */
	makePeer({version, hostID, options}) {
		/** @type {Peer} */
		this.peer = new Peer(options)
		this.peer.on('error', this.errorHandler.bind(this))
		this.peer.on('close', this.onQuit.bind(this))
		this.peer.on('open', id => this.onReady({id, version, hostID}))
		this.peer.on('disconnected', this.onConnection.bind(this))
		this.log('ready')
	}

	/**
	 * Handle errors with the peer.
	 *
	 * @param {Error} e the error
	 */
	errorHandler(e) {
		this.log('error >', e)
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
	 */
	onReady({id, version, hostID}) {
		/** @type {DataConnection} */
		this.host = this.peer.connect(hostID, {
			metadata: {
				version,
			}
		})
		this.host.on('data', this.onReceive_.bind(this))
		this.host.on('error', this.errorHandler.bind(this))
		this.host.on('open', () => this.peer.disconnect()) // leave server
		this.host.on('close', this.onDisconnect.bind(this))
	}

	/**
	 * Receive some data from the host.
	 *
	 * @param data
	 * @private
	 */
	onReceive_(data) {
		if(data.__from)
			this.onReceive(data.__from, data.data)
		else
		  this.onReceive(this.host.id, data)
	}

	/**
	 * Receive some data from someone.
	 *
	 * @param {string} from connection id of sender
	 * @param data
	 */
	onReceive(from, data) {
		this.log('receiving', data)
	}

	/**
	 * Send data to the host.
	 *
	 * @param data
	 * @param {string=} to Connection to send to, leave empty for host
	 */
	send(data, to = '') {
		if(to)
			data = {
				data,
				__to: to,
			}

		this.host.send(data)
		this.log('sending', data)
	}

	/**
	 * Tell the host to broadcast this message.
	 *
	 * @param data
	 */
	broadcast(data) {
		this.host.send({
			data,
			__to: true,
		})
		this.log('broadcasting', data)
	}

	/**
	 * Connected to the host.
	 * Can leave the server now.
	 */
	onConnection() {}

	/**
	 * Disconnected from the host.
	 * Can try to reconnect to the server, then to the host again.
	 */
	onDisconnect() {
		this.log('attempting to reconnect to server')
		this.peer.reconnect()

		// can't connect to server
		if(this.peer.disconnected)
			this.onQuit()
	}

	/**
	 * Peer is destroyed and can no longer accept or create any new connections.
	 * At this time, the peer's connections will all be closed.
	 */
	onQuit() {
		if(!this.peer.destroyed && !this.stopping) {
			this.peer.destroy()
			this.stopping = true
			this.log('Quitting')
		}
	}
}
