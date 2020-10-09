import axios from "axios";
import * as https from "https";

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

interface ClusterCapacity {
  volume: Capacity;
  physical: Capacity;
}

interface Result {
  server: any;
  info: Info;
  disks?: any;
  datastores?: any;
  capacity?: ClusterCapacity;
  [key: string]: any;
}

export default class cXIO {
  private server: any;
  private headersBasic: any;
  private httpsAgent: any;
  private configInfo: any;
  private configDisks: any;
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
    };

    this.httpsAgent = new https.Agent({
      requestCert: true,
      rejectUnauthorized: false, //connection is encrypted but MITM attack is possible. Use only in safe networks
      //ca: fs.readFileSync('/etc/pki/tls/certs/CA.crt'),
      //cert: fs.readFileSync('/etc/pki/tls/certs/server.cer'),
      //key: fs.readFileSync('/etc/pki/tls/private/server.key')
    });

    this.configInfo = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}/api/json/v2/types/clusters/${server.cluster}`,
      headers: this.headersBasic,
    };

    this.configDisks = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}/api/json/v2/types/local-disks?cluster-index=${server.cluster}&full=1`,
      headers: this.headersBasic,
    };

    this.configDatastores = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}/api/json/v2/types/volumes?cluster-index=${server.cluster}&full=1&prop=name&prop=naa-name&prop=vol-size&prop=obj-severity&prop=logical-space-in-use`,
      headers: this.headersBasic,
    };
  }

  async request(commands: Array<string>) {
    let result: Result = {
      server: this.server,
      info: { name: "", model: "" },
    };

    try {
      const thisClass = this;

      await axios(thisClass.configInfo).then(async function (info) {
        result.info["name"] = info.data["content"]["sys-psnt-serial-number"];
        result.info["model"] =
          info.data["content"]["name"] +
          " v" +
          info.data["content"]["sys-sw-version"];

        //process commands
        for (const command of commands) {
          result[command] = [];

          switch (command) {
            case "disks": {
              await axios(thisClass.configDisks).then(async function (disks) {
                result[command] = disks.data["local-disks"];
              });
              break;
            } //case disks

            case "datastores": {
              await axios(thisClass.configDatastores).then(async function (
                response: any
              ) {
                result[command] = response.data["volumes"].map(
                  (volume: any) => {
                    let ndss: any = {};
                    ndss["name"] = volume["name"];
                    ndss["wwn"] = volume["naa-name"];
                    ndss["size"] = Number(volume["vol-size"]); //[kBytes]
                    ndss["health"] = volume["obj-severity"];
                    return ndss;
                  }
                );
              });
              break;
            } //case disks

            case "capacity": {
              //capacity [kBytes]
              let capacity: ClusterCapacity = {
                volume: {
                  total: 0,
                  used: 0,
                  free: 0,
                  available: 0,
                  configured: 0,
                  unconfigured: 0,
                },
                physical: {
                  total: 0,
                  used: 0,
                  free: 0,
                  available: 0,
                  configured: 0,
                  unconfigured: 0,
                },
              };

              capacity.volume.total = Number(info.data["content"]["vol-size"]);
              capacity.volume.used = Number(
                info.data["content"]["logical-space-in-use"]
              );
              capacity.volume.available =
                capacity.volume.total - capacity.volume.used;
              capacity.volume.free = capacity.volume.available;
              capacity.volume.configured =
                capacity.volume.used + capacity.volume.available;
              capacity.physical.total = Number(
                info.data["content"]["ud-ssd-space"]
              );
              capacity.physical.used = Number(
                info.data["content"]["ud-ssd-space-in-use"]
              );
              capacity.physical.available =
                capacity.physical.total - capacity.physical.used;
              capacity.physical.free = capacity.physical.available;
              capacity.physical.configured =
                capacity.physical.used + capacity.physical.available;

              result[command] = capacity;
              break;
            } //case disks
          } //switch
        } //for commands
      }); //axios configInfo
    } catch (error) {
      console.log(this.server, "Error: ", error);
    } finally {
      //TODO: correct Log Out
      //if (loggedIn && (loggedIn.status === 200)) {
      //let loggedOut = await axios(this.configLogout)
      //console.log(loggedOut.data)
      //}
    }

    return result;
  } //request
} //class
