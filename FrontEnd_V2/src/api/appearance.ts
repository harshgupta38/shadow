import { DynamicThemeResponse, UserLocation } from "@/api/types";
import { http } from "@/api/client";


export const appearanceApi = {
    async resolveDynamicTheme(location: UserLocation): Promise<DynamicThemeResponse> {
        return http.get<DynamicThemeResponse>(
            "/settings/appearance/dynamic-resolve",
            {
                params: {
                    latitude: location.latitude,
                    longitude: location.longitude,
                },
            }
        );
    },
};