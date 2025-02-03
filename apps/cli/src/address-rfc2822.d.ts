declare module "address-rfc2822" {
  interface Address {
    address: string;
    name(): string;
    format(): string;
    user(): string;
    host(): string;
  }

  function parse(input: string): Address[];

  export = {
    parse,
  };
}
