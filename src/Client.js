import Peer from 'peerjs'
import debug from 'debug'

export default class Client {
	/**
	 * Create a host as a server to other clients.
	 *
	 * @param key {string} a Peer JS API key.
	 * @param version {string} version of top package, to make sure host and client are in sync.
	 * @param hostID {string} peer id of host to connect to.
	 * @param [logger] {boolean|Function} optional method to log info.
	 */
	constructor({
		key,
		version,
		hostID,
		logger = false,
	}) {
		const options = {
			key,
			secure: false,
		}

		// set logging right
		if (logger === true)
			logger = debug('p2p-server-Host')

		if (typeof logger === 'function') {
			this.log            = logger
			options.debug       = 3
			options.logFunction = this.log.bind(this, 'peerjs >')
		}

		this.makePeer({version, hostID, options})
	}

	/**
	 * Creates the peer
	 * @param version {string} version of top package, to make sure host and client are in sync.
	 * @param hostID {string} peer id of host to connect to.
	 * @param options for the Peer constructor.
	 */
	makePeer({version, hostID, options}) {
		this.peer = new Peer(options)
		this.peer.on('error', err => this.errHandler(err))

		/**
		 * The host leaves and the connections are all dropped.
		 */
		this.peer.on('close', () => this.quit())

		/**
		 * Connect to the host.
		 * Then disconnect from the server.
		 */
		this.peer.on('open', id => this.open({id, version, hostID}))

		/**
		 * Disconnected from the peer server.
		 */
		this.peer.on('disconnected', () => this.disconnect())
	}

	/**
	 * Handle errors with the peer.
	 * @param e
	 */
	errHandler(e) {
		this.log('error >', e)
	}

	/**
	 * Logs info, empty by default.
	 */
	log() {}

	/**
	 * When an ID is generated.
	 * @param id {string} generated peer id for client.
	 * @param version {string} version of top package, to make sure host and client are in sync.
	 * @param hostID {string} peer id of host to connect to.
	 */
	open({id, version, hostID}) {
		/** @type {DataConnection} */
		this.host = this.peer.connect(hostID, {
			metadata: {
				version,
			}
		})

		this.host.on('data', data => this.recieve(data.from, data.data))
		this.host.on('error', err => this.errHandler(err))

		/**
		 * leave server once ready
		 */
		this.host.on('open', () => this.peer.disconnect())

		/**
		 * When the connection is closed.
		 * Can try to reconnect though.
		 */
		this.host.on('close', () => {
			this.log('attempting to reconnect to server')
			this.peer.reconnect()

			// can't connect to server
			if(this.peer.disconnected)
			this.quit()
		})
	}

	/**
	 * Receive some data from the host
	 * @param data
	 */
	receive(data) {
		this.log('receiving', data)
	}

	/**
	 * Send data to the host
	 * @param data
	 */
	send(data) {
		this.host.send(data)
		this.log('sending', data)
	}

	/**
	 * Leave the server.
	 * Should only be connected to the host.
	 */
	disconnect() {
		log('Left server.')
	}

	/**
	 * Peer is destroyed and can no longer accept or create any new connections.
	 * At this time, the peer's connections will all be closed.
	 */
	quit() {
		if(!this.peer.destroyed && !this.stopping) {
			this.peer.destroy()
			this.stopping = true
			this.log('Quitting')
		}
	}
}
