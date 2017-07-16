import 'should'
import MockPeer, {MockDataConnection} from './MockPeer'
import Module from 'module'

const originalRequire = Module.prototype.require;
Module.prototype.require = function() {
	if (arguments[0] === 'peerjs')
		return MockPeer
	return originalRequire.apply(this, arguments);
}

// Dynamic require to use PeerJS Mocker
const {default: Client} = require( '../src/Client' )
const {default: Host} = require( '../src/Host' )

describe('Client', () => {
	it('should connect', function (done) {
		const hostID = 'pootis'
		const host = new Host(hostID)

		host.on('ready', hostID => {
			const friend = new Client({hostID})

			friend.on('ready', () => {
				friend.should.be.instanceof(Client)
				friend.peer.should.be.instanceof(MockPeer)
				friend.host.should.be.instanceof(MockDataConnection)

				friend.host.connectedPeer.should.eql(host.peer)
				done()
			})
		})
	})

	it('should send a message to the host', function (done) {
		const version = 6
		const message = {
			hello: 'world'
		}
		const host = new Host({version})

		host.on('ready', hostID => {
			const friend = new Client({hostID, version})

			friend.on('ready', () => {
				host.on('data', ({from, data}) => {
					from.should.be.instanceof(MockDataConnection)
					friend.host.connectedPeer.should.eql(from.host)

					message.should.eql(data)
					done()
				})

				friend.send(message)
			})
		})
	})

	it('should send a message to a client', function (done) {
		const version = 6
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Host({version})

		host.on('ready', hostID => {
			host.on('connection', hostConnectionToFriend => {
				friend.on('data', ({from, data}) => {
					(from === undefined).should.be.true()
					message.should.eql(data)

					done()
				})

				host.sendTo(hostConnectionToFriend, message)
			})

			const friend = new Client({hostID, version})
		})
	})
})
