import type Anthropic from '@anthropic-ai/sdk'

export const definition: Anthropic.Tool = {
  name: 'request_location',
  description:
    'Requests the user\'s device location via the browser\'s Geolocation API. ' +
    'Call this ONLY after the user has explicitly agreed to share their location. ' +
    'The browser will prompt the user for permission. ' +
    'On success, returns { latitude, longitude, city, state }. ' +
    'On failure (denied or unavailable), returns { error: string }. ' +
    'After a successful result, call update_user_details to save currentCity and currentState, ' +
    'then proceed with the location-based search.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
}
