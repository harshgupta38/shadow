import { UserLocation } from "@/api";
import { TIMING } from "@/constant/tuning";

export async function getUserLocation(): Promise<UserLocation | null> {
    if (typeof navigator === "undefined" || !navigator.geolocation)
        return null;

    return new Promise<UserLocation | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            () => {
                resolve(null);
            },
            {
                enableHighAccuracy: false,
                maximumAge: TIMING.LOCATION_CACHE_MAX_AGE_MS,
                timeout: TIMING.LOCATION_TIMEOUT_MS,
            }
        );
    });
}