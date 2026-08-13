import { initBotId } from "botid/client/core";

initBotId({
  protect: [
    {
      path: "/api/reservations",
      method: "POST",
      advancedOptions: { checkLevel: "basic" },
    },
  ],
});
