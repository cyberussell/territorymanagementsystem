declare module 'open-location-code' {
  export interface CodeArea {
    latitudeLo: number
    longitudeLo: number
    latitudeHi: number
    longitudeHi: number
    latitudeCenter: number
    longitudeCenter: number
    codeLength: number
  }

  export class OpenLocationCode {
    encode(latitude: number, longitude: number, codeLength?: number): string
    decode(code: string): CodeArea
    isValid(code: string): boolean
    isShort(code: string): boolean
    isFull(code: string): boolean
    // Resolves a short/local-form code (e.g. "5JJ6+F8", missing its leading area digits) to a
    // full code, given a nearby reference point — correct as long as the reference is within
    // ~0.5 degrees (~55km) of the true location. Returns the short code unchanged if it's
    // already full; throws a string (not an Error) if the code isn't a valid short/full code.
    recoverNearest(shortCode: string, referenceLatitude: number, referenceLongitude: number): string
  }
}
