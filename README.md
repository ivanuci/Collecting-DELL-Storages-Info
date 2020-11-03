# Collecting-DELL-Storages-Info
Getting info from some of Dell storages (Unity, XIO, Isilon, VNX, Data Domain) through API and CLI with Node.js using TypeScript

### Classes for each storage:
  * cDataDomain.ts
  * cIsilon.ts
  * cUnity.ts
  * cVNX.ts
  * cXIO.ts

### Credentials to use:
  * accounts.ts

### Main program:
  * get-storages.ts
  

### Running program:

#### 1. Transpiling and executing on the fly

```bash
npx ts-node src/get-storages.ts
```

OR

#### 2. Transpile get-storages.ts to get-storages.js and then execute the last

```bash
npx tsc
node build/get-storages.js
```
