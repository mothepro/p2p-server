import 'should'
import msgpack from 'msgpack-lite'

const codec = msgpack.createCodec()
codec.addExtPacker(0x1C, Map, [map => [...map], msgpack.encode])
codec.addExtUnpacker(0x1C, [msgpack.decode, entries => new Map(entries)])
codec.addExtPacker(0x0E, Error, [packError, msgpack.encode])
codec.addExtUnpacker(0x0E, [msgpack.decode, unpackError])

function packError(err) {
	const obj = Object.assign({}, err)
	obj.message = err.message
	return obj
}

function unpackError(err) {
	const error = Error(err.message)

	for(const key of Object.keys(err))
		error[key] = err[key]

	return error
}

describe('Tests', () => {
	it('of course', function () {
		const data = {
			"int": 1,
			"float": 0.5,
			"boolean": true,
			"null": null,
			"string": "foo bar",
			"array": [
				"foo",
				"bar"
			],
			"object": {
				"foo": 1,
				"baz": 0.5
			},
			"map": new Map([
				['hello', 'world'],
				[1, 12345]
			])
		}

		const buffer = msgpack.encode(data, {codec})
		const actual = msgpack.decode(buffer, {codec})

		actual.should.eql(data)
	})

	it('Errors', function () {
		const error = Error('pootis')
		error.name = 'nope'
		error.columnNumber = 6
		error.more = true
		error.type = 'extra'

		const buffer = msgpack.encode(error, {codec})
		const actual = msgpack.decode(buffer, {codec})

		actual.should.be.an.Error()
		actual.should.eql(error)
	})
})
