import { getRequestConfig } from "next-intl/server";
import { ASUNCION_TIME_ZONE } from "@/lib/datetime";
import { getUserLocale } from "./locale";

export default getRequestConfig(async () => {
  const locale = await getUserLocale();

  return {
    locale,
    timeZone: ASUNCION_TIME_ZONE,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
