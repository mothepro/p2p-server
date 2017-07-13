import {encode, decode, createCodec} from 'msgpack-lite'

const codec = createCodec({preset: true})
const errorMap = new Map([
	[0x0E, Error],
	[0x01, EvalError],
	[0x02, RangeError],
	[0x03, ReferenceError],
	[0x04, SyntaxError],
	[0x05, TypeError],
	[0x06, URIError],
])

// Override codecs for Map's and Errors
register(0x1C, Map, map => [...map], entries => new Map(entries))
for(const [code, errType] of errorMap)
	registerError(code, errType)

/**
 * Pack data into a smaller format.
 * @param {*} data
 * @return {Buffer}
 */
export const pack = (data) => encode(data, {codec})

/**
 * Unpack data into a useable format.
 * @param {Buffer} data
 * @return {*}
 */
export const unpack = (data) => decode(data, {codec})

/**
 * Register an Extension type in the message pack codec
 *
 * @param {int} code should be an integer within the range of 0 and 127
 *  List of current ones: https://github.com/kawanet/msgpack-lite#extension-types
 * @param {constructor} cls Class to be encoded
 * @param {function(cls): <T>} packer Convert instance of cls into an object that can be packed
 * @param {function(<T>): cls} unpacker Convert a buffer into an instance of cls
 */
export function register(code, cls, packer, unpacker) {
	codec.addExtPacker(code, cls, [packer, encode])
	codec.addExtUnpacker(code, [decode, unpacker])
}

/**
 * Register an Error as an Extension type.
 * @param code
 * @param cls
 */
export function registerError(code, cls) {
	return register(code, cls, function (err) {
		const obj = Object.assign({}, err)
		obj.message = err.message
		return obj
	}, function (errData) {
		const error = new cls(errData.message)

		for (const key of Object.keys(errData))
			error[key] = errData[key]

		return error
	})
}
