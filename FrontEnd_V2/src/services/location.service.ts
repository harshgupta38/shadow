import { UserLocation } from "@/api";

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
                maximumAge: 10 * 60 * 1000, // Reuse location up to 10 minutes old
                timeout: 7000,              // Wait at most 7 seconds
            }
        );
    });
}