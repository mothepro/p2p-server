import * as EventEmitter from 'events'

declare let global: { window: {} }
global['window'] = <any>{
	RTCIceCandidate: {},
	RTCSessionDescription: {},
	RTCPeerConnection: {},
}

type peerID = string
type dcID = string

const allPeers: Map<peerID, MockPeer> = new Map

/**
 * A Mock of a WebRTC DataChannel
 */
class MockDataConnection extends EventEmitter {
    client: MockDataConnection
    readonly peer: peerID = this.host.id

    open: boolean = false

    readonly type: string = 'data'
    readonly buffSize: number = 0
    readonly id: dcID
    readonly serialization: string
    readonly reliable: boolean
    readonly label: string
    readonly metadata: Object

    readonly dataChannel: RTCDataChannel
    readonly peerConnection: any
    off = this.removeListener
    removeAllListeners(event?: string) {
        return this
    }

    constructor(public host: MockPeer, {
        label = '',
        metadata = { version: '0' },
        serialization = 'none',
        reliable = false,
        connectionId = `dc_${MockPeer.randomID()}`,
    }: any = {}) {
        super()

        this.id = connectionId
        this.serialization = serialization
        this.reliable = reliable
        this.label = label
        this.metadata = metadata

        setTimeout(() => this.ready(), 0)
    }

    ready() {
        this.open = true
        this.emit('open')
    }

    send(data: any) {
        this.client.emit('data', data)
    }

    close() {
        this.open = false
        this.emit('close')
    }
}

class MockPeer extends EventEmitter {
    static MockDataConnection = MockDataConnection

	destroyed: boolean = false
	disconnected: boolean = false
	connectionMap: Map<peerID, MockDataConnection> = new Map
	off = this.removeListener

	// Un documented PeerJS features.
    call(id: string, stream: any, options?: any): PeerJs.MediaConnection {
    	return <PeerJs.MediaConnection>{}
	}
    getConnection(peer: PeerJs.Peer, id: string): any {}
    listAllPeers(callback: (peerIds: Array<string>)=>void): void {}

	constructor(public id: any, options?: PeerJs.PeerJSOption) {
		super()

		// only gave options
		if(typeof id === 'object' || id === undefined) {
			options = <PeerJs.PeerJSOption>id
			id = MockPeer.randomID()
		}

		allPeers.set(this.id, this)
		setTimeout(() => this.emit('open', id), 0)
	}

	connect(id: peerID, options?: PeerJs.PeerConnectOption): MockDataConnection {
		const otherPeer =  allPeers.get(id)
		if(!otherPeer)
			throw Error(`Unable to connect to to ${id}.`)

		const myData = new MockDataConnection(this, options)
		const theirData = new MockDataConnection(otherPeer, options)

		myData.client = theirData
		theirData.client = myData

		this.connectionMap.set(id, theirData)
		otherPeer.connectionMap.set(this.id, myData)

		otherPeer.emit('connection', theirData)
		return myData
	}

	disconnect() {
		this.disconnected = true
		this.emit('disconnected')
	}

	reconnect() {
		if(!this.disconnected) {
			const err = <any>Error('Must be disconnected to reconnect.')
			err.type = 'disconnected'
			this.emit('error', err)
		}
		this.disconnected = true
	}

	destroy() {
		allPeers.delete(this.id)
		for(const connection of this.connectionMap.values())
			connection.host.connectionMap.delete(this.id)
		this.destroyed = true
		this.emit('close')
	}

	get connections(): { [id in peerID]: MockDataConnection } {
		const connections: {[id: string]: MockDataConnection} = {}
		for(const [id, connection] of this.connectionMap)
			connections[id] = connection
		return connections
	}

	static randomID() : string {
		let num = (new Date).getTime()
		num += Math.random()
		num *= 100
		const ret = <string>Math.floor(num).toString(36) // base 36
		return ret.substr(3, 7) // remove repetition
	}
}

export = MockPeer
