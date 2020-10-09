import axios from "axios";
import * as https from "https";
import axiosCookieJarSupport from "axios-cookiejar-support";
import * as tough from "tough-cookie";
axiosCookieJarSupport(axios);

interface Account {
  username: string;
  password: string;
}

interface Info {
  name: string;
  model: string;
}

interface Capacity {
  total: number;
  used: number;
  free: number;
  available: number;
  configured: number;
  unconfigured: number;
}

interface Result {
  server: any;
  info: Info;
  disks?: any;
  datastores?: any;
  capacity?: Capacity;
  [key: string]: any;
}

export default class cUnity {
  private server: any;
  private headersBasic: any;
  private headersToken: any;
  private httpsAgent: any;
  private cookieJar: any;
  private configInfo: any;
  private configLogin: any;
  private configLogout: any;
  private configDisks: any;
  private configCapacity: any;
  private configTier: any;
  private configDatastores: any;

  constructor(server: any, account: Account) {
    this.server = server;

    this.headersBasic = {
      Authorization:
        "Basic " +
        Buffer.from(account.username + ":" + account.password).toString(
          "base64"
        ),
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-EMC-REST-CLIENT": "true",
    };

    this.headersToken = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "EMC-CSRF-TOKEN": "",
    };

    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false, //connection is encrypted but MITM attack is possible. Use only in safe networks
    });

    this.cookieJar = new tough.CookieJar();

    this.configInfo = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}/api/types/basicSystemInfo/instances`,
    };

    this.configLogin = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}/api/types/system/instances`,
      headers: this.headersBasic,
      jar: this.cookieJar,
      withCredentials: true,
    };

    this.configLogout = {
      method: "post",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}/api/types/loginSessionInfo/action/logout`,
      headers: this.headersToken,
      data: { localCleanupOnly: true },
    };

    this.configDisks = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}/api/types/disk/instances?fields=isInUse,bank,vendorSize,maxSpeed,id,wwn,parentDae,parentDpe,isFastCacheInUse,bankSlotNumber,emcPartNumber,tierType,isSED,size,model,diskGroup,bankSlot,name,version,manufacturer,rawSize,pool,needsReplacement,parent,currentSpeed,slotNumber,diskTechnology,emcSerialNumber,estimatedEOL,busId,rpm,health`,
      headers: this.headersToken,
      jar: this.cookieJar,
      withCredentials: true,
    };

    this.configCapacity = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}/api/types/systemCapacity/instances?fields=sizeFree,sizeTotal,sizeUsed`,
      headers: this.headersToken,
      jar: this.cookieJar,
      withCredentials: true,
    };

    this.configTier = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}/api/types/storageTier/instances?fields=sizeUnconfigured::@sum(sizeTotal)&per_page=2000`,
      headers: this.headersToken,
      jar: this.cookieJar,
      withCredentials: true,
    };

    this.configDatastores = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}/api/types/lun/instances?fields=name,health,sizeTotal,wwn&compact=true`,
      headers: this.headersToken,
      jar: this.cookieJar,
      withCredentials: true,
    };
  }

  async request(commands: Array<string>) {
    let result: Result = {
      server: this.server,
      info: { name: "", model: "" },
    };

    try {
      const thisClass = this;

      await axios(thisClass.configInfo).then(async function (info: any) {
        result.info["name"] = info.data.entries[0].content["name"];
        result.info["model"] =
          info.data.entries[0].content["model"] +
          " v" +
          info.data.entries[0].content["softwareVersion"];
      });

      var loggedIn = await axios(thisClass.configLogin).then(async function (
        login: any
      ) {
        thisClass.headersToken["EMC-CSRF-TOKEN"] =
          login.headers["emc-csrf-token"];

        //process commands
        for (const command of commands) {
          result[command] = [];

          switch (command) {
            case "disks": {
              await axios(thisClass.configDisks).then(async function (
                disks: any
              ) {
                result[command] = disks.data.entries.map(function (el: any) {
                  var cn = el.content;
                  cn.health = cn.health.value;
                  cn.parent = cn.parent.value;
                  if (cn.diskGroup) cn.diskGroup = cn.diskGroup.id;
                  if (cn.parentDae) cn.parentDae = cn.parentDae.id;
                  if (cn.pool) cn.pool = cn.pool.id;
                  return el.content;
                });
              });
              break;
            } //case disks

            case "capacity": {
              //capacity [kBytes]
              let capacity: Capacity = {
                total: 0,
                used: 0,
                free: 0,
                available: 0,
                configured: 0,
                unconfigured: 0,
              };

              await axios(thisClass.configCapacity).then(async function (
                elements: any
              ) {
                elements.data.entries.forEach(function (entrie: any) {
                  capacity.used += entrie["content"]["sizeUsed"];
                  capacity.free += entrie["content"]["sizeFree"];
                  capacity.configured += entrie["content"]["sizeTotal"]; //= used + free
                });
              });

              await axios(thisClass.configTier).then(async function (
                elements: any
              ) {
                elements.data.entries.forEach(function (entrie: any) {
                  capacity.unconfigured +=
                    entrie["content"]["sizeUnconfigured"];
                });
              });

              capacity.used = capacity.used / 1024;
              capacity.free = capacity.free / 1024;
              capacity.configured = capacity.configured / 1024;
              capacity.unconfigured = capacity.unconfigured / 1024;
              capacity.total = capacity.configured + capacity.unconfigured;
              capacity.available = capacity.free + capacity.unconfigured;

              result[command] = capacity;
              break;
            } //case capacity

            case "datastores": {
              await axios(thisClass.configDatastores).then(async function (
                disks: any
              ) {
                result[command] = disks.data.entries.map(function (el: any) {
                  let ds: any = {};
                  ds["name"] = el["content"]["name"];
                  ds["wwn"] = el["content"]["wwn"];
                  ds["size"] = Number(el["content"]["sizeTotal"]) / 1024; //kBytes
                  ds["health"] = el["content"]["health"]["value"];
                  return ds;
                });
              });
              break;
            } //case datastores
          } //switch
        } //for commands
      });
    } catch (error) {
      console.log(this.server, "Error: ", error);
    } finally {
      if (this.headersToken["EMC-CSRF-TOKEN"] !== "") {
        await axios(this.configLogout).then(function (logout) {
          //console.log("LogOut: " + JSON.stringify(logout.data))
        });
      }
    }

    return result;
  } //request
} //class
