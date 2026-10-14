const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

export function streetViewUrl(
  lat: number,
  lng: number,
  width: number,
  height: number,
): string | null {
  if (!MAPS_API_KEY) return null
  return (
    `https://maps.googleapis.com/maps/api/streetview` +
    `?size=${width}x${height}&location=${lat},${lng}&source=outdoor&return_error_codes=true&key=${MAPS_API_KEY}`
  )
}
