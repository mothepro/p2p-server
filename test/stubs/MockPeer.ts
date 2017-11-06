import * as EventEmitter from 'events'
import Peer = require('peerjs')
import RTCDataChannel = require('peerjs')

declare let global: { window: {} }
global['window'] = <any>{
	RTCIceCandidate: {},
	RTCSessionDescription: {},
	RTCPeerConnection: {},
}

const allPeers: Map<MockPeer.peerID, MockPeer> = new Map

class MockPeer extends EventEmitter {
	destroyed: boolean = false
	disconnected: boolean = false
	private connectionMap: Map<MockPeer.peerID, MockPeer.MockDataConnection> = new Map

	// Un documented PeerJS features.
    call(id: string, stream: any, options?: any): Peer.MediaConnection {
    	return <Peer.MediaConnection>{}
	}
    getConnection(peer: Peer, id: string): any {}
    listAllPeers(callback: (peerIds: Array<string>)=>void): void {}

	constructor(public id: any, options?: Peer.PeerJSOption) {
		super()

		// only gave options
		if(typeof id === 'object' || id === undefined) {
			options = <Peer.PeerJSOption>id
			id = MockPeer.randomID()
		}

		allPeers.set(this.id, this)
		setTimeout(() => this.emit('open', id), 0)
	}

	connect(id: MockPeer.peerID, options?: Peer.PeerConnectOption): MockPeer.MockDataConnection {
		const otherPeer =  allPeers.get(id)
		if(!otherPeer)
			throw Error(`Unable to connect to to ${id}.`)

		const myData = new MockPeer.MockDataConnection(this, options)
		const theirData = new MockPeer.MockDataConnection(otherPeer, options)

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

	get connections(): { [id in MockPeer.peerID]: MockPeer.MockDataConnection } {
		const connections: {[id: string]: MockPeer.MockDataConnection} = {}
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

module MockPeer {
    export type peerID = string
    export type dcID = string

    /**
     * A Mock of a WebRTC DataChannel
     */
    export class MockDataConnection extends EventEmitter {
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

        constructor(public host: MockPeer, {
            label = '',
            metadata = {version: '0'},
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
}

export = MockPeer
