import type { Filter } from "@mastra/core/filter";
import type { IndexStats, QueryResult } from "@mastra/core/vector";
import { MastraVector } from "@mastra/core/vector";
import {
  Turbopuffer,
  type DistanceMetric,
  type QueryResults,
  type Schema,
  type Vector,
} from "@turbopuffer/turbopuffer";
import { TurbopufferFilterTranslator } from "./filter";

export interface TurbopufferVectorOptions {
  /** The API key to authenticate with. */
  apiKey: string;
  /** The base URL. Default is https://api.turbopuffer.com. */
  baseUrl?: string;
  /** The timeout to establish a connection, in ms. Default is 10_000. Only applicable in Node and Deno.*/
  connectTimeout?: number;
  /** The socket idle timeout, in ms. Default is 60_000. Only applicable in Node and Deno.*/
  connectionIdleTimeout?: number;
  /** The number of connections to open initially when creating a new client. Default is 0. */
  warmConnections?: number;
  /** Whether to compress requests and accept compressed responses. Default is true. */
  compression?: boolean;
  /**
   * A callback function that takes an index name and returns a config object for that index.
   * This allows you to define custom schemas per index and configure dimensions for your
   * preferred embedding model.
   *
   * Example:
   * ```typescript
   * schemaConfigForIndex: (indexName) => ({
   *   dimensions: 1024, // voyage-3-large
   *   schema: {
   *     thread_id: { type: "string", filterable: true },
   *   },
   * })
   * ```
   */
  schemaConfigForIndex?: (indexName: string) => {
    dimensions: number;
    schema: Schema;
  };
}

export class TurbopufferVector extends MastraVector {
  private client: Turbopuffer;
  private filterTranslator: TurbopufferFilterTranslator;
  // MastraVector takes in distance metric in createIndex, but we need it in upsert(),
  // so remember it in this cache
  private distanceMetricCache: Map<string, DistanceMetric> = new Map();
  // Mastra calls createIndex often, but to create an index requires inserting a vector,
  // so cache the fact that we called createIndex
  private createIndexCache: Map<string, boolean> = new Map();
  private opts: TurbopufferVectorOptions;

  constructor(opts: TurbopufferVectorOptions) {
    console.log(
      `DEBUG turbopuffer constructor apiKey=${
        opts.apiKey ? "[REDACTED]" : undefined
      } baseUrl=${opts.baseUrl}`
    );
    super();
    this.filterTranslator = new TurbopufferFilterTranslator();
    this.opts = opts;

    const baseClient = new Turbopuffer(opts);
    const telemetry = this.__getTelemetry();
    this.client =
      telemetry?.traceClass(baseClient, {
        spanNamePrefix: "turbopuffer-vector",
        attributes: {
          "vector.type": "turbopuffer",
        },
      }) ?? baseClient;
  }

  async createIndex(
    indexName: string,
    dimension: number,
    metric: "cosine" | "euclidean" | "dotproduct" = "cosine"
  ): Promise<void> {
    if (this.createIndexCache.has(indexName)) {
      return;
    }
    console.log(
      `DEBUG turbopuffer createIndex indexName=${indexName} dimension=${dimension} metric=${metric}`
    );
    if (dimension <= 0) {
      throw new Error("Dimension must be a positive integer");
    }
    let distanceMetric: DistanceMetric = "cosine_distance";
    switch (metric) {
      case "cosine":
        distanceMetric = "cosine_distance";
        break;
      case "euclidean":
        distanceMetric = "euclidean_squared";
        break;
      case "dotproduct":
        throw new Error("dotproduct is not supported in Turbopuffer");
    }
    this.distanceMetricCache.set(indexName, distanceMetric);
    try {
      // Create initial vector with id and proper format
      const schemaConfig = this.opts.schemaConfigForIndex?.(indexName);
      if (schemaConfig) {
        dimension = schemaConfig.dimensions;
      }
      await this.client.namespace(indexName).upsert({
        vectors: [
          {
            id: `${indexName}-init`, // one "init" vector per index, upsertable many times
            vector: Array(dimension).fill(0.0),
            attributes: { _init: true },
          },
        ],
        schema: {
          ...(schemaConfig?.schema || {}),
          _init: { type: "bool", filterable: true },
        },
        distance_metric: distanceMetric,
      });
      this.createIndexCache.set(indexName, true);
    } catch (error: any) {
      throw new Error(
        `Failed to create Turbopuffer namespace ${indexName}: ${error.message}`
      );
    }
  }

  private getDistanceMetric(indexName: string): DistanceMetric {
    if (this.distanceMetricCache.has(indexName)) {
      return this.distanceMetricCache.get(indexName)!;
    }
    console.warn(
      `Could not determine distance metric for ${indexName}, defaulting to cosine_distance. Call createIndex() to register a distance metric for this index.`
    );
    return "cosine_distance";
  }

  async upsert(
    indexName: string,
    vectors: number[][],
    metadata?: Record<string, any>[],
    ids?: string[]
  ): Promise<string[]> {
    console.log(
      `DEBUG turbopuffer upsert indexName=${indexName} vectors.length=${vectors.length} metadata.length=${metadata?.length} ids.length=${ids?.length}`
    );
    try {
      const index = this.client.namespace(indexName);
      const distanceMetric = await this.getDistanceMetric(indexName);
      const vectorIds = ids || vectors.map(() => crypto.randomUUID());
      const records: Vector[] = vectors.map((vector, i) => ({
        id: vectorIds[i]!,
        vector: vector,
        attributes: metadata?.[i] || {},
      }));

      // limit is 256 MB per upsert request, so set a reasonable batch size here that will stay under that for most cases
      // https://turbopuffer.com/docs/limits
      const batchSize = 100;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const upsertOptions: {
          vectors: Vector[];
          distance_metric: DistanceMetric;
          schema?: Schema;
          batchSize?: number;
        } = {
          vectors: batch,
          distance_metric: distanceMetric,
        };

        // Use the schemaForIndex callback if provided
        const schemaConfig = this.opts.schemaConfigForIndex?.(indexName);
        if (schemaConfig) {
          upsertOptions.schema = schemaConfig.schema;
          if (vectors[0].length !== schemaConfig.dimensions) {
            throw new Error(
              `Turbopuffer index ${indexName} was configured with dimensions=${schemaConfig.dimensions} but attempting to upsert vectors[0].length=${vectors[0].length}`
            );
          }
        }

        await index.upsert(upsertOptions);
      }

      return vectorIds;
    } catch (error) {
      throw new Error(
        `Failed to upsert vectors into Turbopuffer namespace ${indexName}: ${error}`
      );
    }
  }

  async query(
    indexName: string,
    queryVector: number[],
    topK: number = 10,
    filter?: Filter,
    includeVector: boolean = false
  ): Promise<QueryResult[]> {
    console.log(
      `DEBUG turbopuffer query indexName=${indexName} queryVector.length=${
        queryVector.length
      } topK=${topK} filter=${
        filter ? JSON.stringify(filter) : "undefined"
      } includeVector=${includeVector}`
    );
    const schemaConfig = this.opts.schemaConfigForIndex?.(indexName);
    if (schemaConfig) {
      if (queryVector.length !== schemaConfig.dimensions) {
        throw new Error(
          `Turbopuffer index ${indexName} was configured with dimensions=${schemaConfig.dimensions} but attempting to query with queryVector.length=${queryVector.length}`
        );
      }
    }
    try {
      const index = this.client.namespace(indexName);
      const translatedFilter = this.filterTranslator.translate(filter);
      const results: QueryResults = await index.query({
        distance_metric: await this.getDistanceMetric(indexName),
        vector: queryVector,
        top_k: topK,
        filters: translatedFilter,
        include_vectors: includeVector,
        include_attributes: true,
        consistency: { level: "strong" }, // todo: make this configurable somehow?
      });
      return results.map((item) => ({
        id: String(item.id),
        score: typeof item.dist === "number" ? item.dist : 0,
        metadata: item.attributes || {},
        ...(includeVector && item.vector ? { vector: item.vector } : {}),
      }));
    } catch (error) {
      throw new Error(
        `Failed to query Turbopuffer namespace ${indexName}: ${error}`
      );
    }
  }

  async listIndexes(): Promise<string[]> {
    console.log(`DEBUG turbopuffer listIndexes`);
    try {
      const namespacesResult = await this.client.namespaces({});
      return namespacesResult.namespaces.map((namespace) => namespace.id);
    } catch (error) {
      throw new Error(`Failed to list Turbopuffer namespaces: ${error}`);
    }
  }

  async describeIndex(indexName: string): Promise<IndexStats> {
    console.log(`DEBUG turbopuffer describeIndex indexName=${indexName}`);
    try {
      const namespace = this.client.namespace(indexName);
      const metadata = await namespace.metadata();
      const distanceMetric = await this.getDistanceMetric(indexName);
      let metric: "cosine" | "euclidean" | "dotproduct" = "cosine";
      if (distanceMetric === "euclidean_squared") {
        metric = "euclidean";
      } else {
        metric = "cosine";
      }
      const dimension = metadata.dimensions;
      const count = metadata.approx_count;

      return {
        dimension,
        count,
        metric,
      };
    } catch (error) {
      throw new Error(
        `Failed to describe Turbopuffer namespace ${indexName}: ${error}`
      );
    }
  }

  async deleteIndex(indexName: string): Promise<void> {
    console.log(`DEBUG turbopuffer deleteIndex indexName=${indexName}`);
    try {
      const namespace = this.client.namespace(indexName);
      await namespace.deleteAll();
      this.distanceMetricCache.delete(indexName);
    } catch (error: any) {
      throw new Error(
        `Failed to delete Turbopuffer namespace ${indexName}: ${error.message}`
      );
    }
  }
}
