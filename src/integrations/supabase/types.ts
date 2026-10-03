export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_clients: {
        Row: {
          active: boolean
          created_at: string
          id: string
          ip_whitelist: string[]
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          rate_limit_per_min: number
          request_count: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          ip_whitelist?: string[]
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          rate_limit_per_min?: number
          request_count?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          ip_whitelist?: string[]
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          rate_limit_per_min?: number
          request_count?: number
        }
        Relationships: []
      }
      api_rate_buckets: {
        Row: {
          client_id: string
          hits: number
          window_start: string
        }
        Insert: {
          client_id: string
          hits?: number
          window_start: string
        }
        Update: {
          client_id?: string
          hits?: number
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_rate_buckets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomous_streams: {
        Row: {
          bitrate_kbps: number | null
          category: string | null
          choicely_id: string | null
          created_at: string
          custom_headers: Json | null
          failover_group: string | null
          failure_count: number
          geo_country: string | null
          id: string
          is_active: boolean
          last_checked_at: string | null
          last_pushed_at: string | null
          normalized_title: string | null
          poster_image_url: string | null
          priority: number
          quality_tier: string | null
          resolution: string | null
          response_ms: number | null
          source: string | null
          source_website: string | null
          status: string
          stream_url: string
          title: string
          type: string
          updated_at: string
          variants: Json
        }
        Insert: {
          bitrate_kbps?: number | null
          category?: string | null
          choicely_id?: string | null
          created_at?: string
          custom_headers?: Json | null
          failover_group?: string | null
          failure_count?: number
          geo_country?: string | null
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_pushed_at?: string | null
          normalized_title?: string | null
          poster_image_url?: string | null
          priority?: number
          quality_tier?: string | null
          resolution?: string | null
          response_ms?: number | null
          source?: string | null
          source_website?: string | null
          status?: string
          stream_url: string
          title: string
          type?: string
          updated_at?: string
          variants?: Json
        }
        Update: {
          bitrate_kbps?: number | null
          category?: string | null
          choicely_id?: string | null
          created_at?: string
          custom_headers?: Json | null
          failover_group?: string | null
          failure_count?: number
          geo_country?: string | null
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_pushed_at?: string | null
          normalized_title?: string | null
          poster_image_url?: string | null
          priority?: number
          quality_tier?: string | null
          resolution?: string | null
          response_ms?: number | null
          source?: string | null
          source_website?: string | null
          status?: string
          stream_url?: string
          title?: string
          type?: string
          updated_at?: string
          variants?: Json
        }
        Relationships: []
      }
      crawl_jobs: {
        Row: {
          attempts: number
          created_at: string
          depth: number
          error: string | null
          finished_at: string | null
          id: string
          locked_at: string | null
          referer: string | null
          status: string
          url: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          depth?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          referer?: string | null
          status?: string
          url: string
        }
        Update: {
          attempts?: number
          created_at?: string
          depth?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          referer?: string | null
          status?: string
          url?: string
        }
        Relationships: []
      }
      crawl_runs: {
        Row: {
          created_at: string
          id: string
          item_count: number
          log: Json
          root_url: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_count?: number
          log?: Json
          root_url: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_count?: number
          log?: Json
          root_url?: string
          status?: string
        }
        Relationships: []
      }
      discovery_queries: {
        Row: {
          active: boolean
          created_at: string
          engine: string
          hit_count: number
          id: string
          last_run_at: string | null
          query: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          engine?: string
          hit_count?: number
          id?: string
          last_run_at?: string | null
          query: string
        }
        Update: {
          active?: boolean
          created_at?: string
          engine?: string
          hit_count?: number
          id?: string
          last_run_at?: string | null
          query?: string
        }
        Relationships: []
      }
      engine_metrics: {
        Row: {
          avg_ms: number
          banned: number
          failed: number
          found: number
          id: string
          kind: string
          requests: number
          success: number
          ts: string
        }
        Insert: {
          avg_ms?: number
          banned?: number
          failed?: number
          found?: number
          id?: string
          kind: string
          requests?: number
          success?: number
          ts?: string
        }
        Update: {
          avg_ms?: number
          banned?: number
          failed?: number
          found?: number
          id?: string
          kind?: string
          requests?: number
          success?: number
          ts?: string
        }
        Relationships: []
      }
      engine_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      epg_programs: {
        Row: {
          channel_key: string
          channel_name: string | null
          description: string | null
          id: string
          start_at: string
          stop_at: string
          title: string
        }
        Insert: {
          channel_key: string
          channel_name?: string | null
          description?: string | null
          id?: string
          start_at: string
          stop_at: string
          title: string
        }
        Update: {
          channel_key?: string
          channel_name?: string | null
          description?: string | null
          id?: string
          start_at?: string
          stop_at?: string
          title?: string
        }
        Relationships: []
      }
      epg_sources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          last_synced_at: string | null
          program_count: number
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          last_synced_at?: string | null
          program_count?: number
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          last_synced_at?: string | null
          program_count?: number
          url?: string
        }
        Relationships: []
      }
      feed_cache: {
        Row: {
          body: string
          content_type: string
          expires_at: string
          key: string
        }
        Insert: {
          body: string
          content_type: string
          expires_at: string
          key: string
        }
        Update: {
          body?: string
          content_type?: string
          expires_at?: string
          key?: string
        }
        Relationships: []
      }
      media_items: {
        Row: {
          created_at: string
          episode: number | null
          episode_name: string | null
          id: string
          is_alive: boolean
          kind: string
          last_checked_at: string
          season: number | null
          source_url: string
          stream_url: string
          thumbnail: string | null
          title: string
          year: number | null
        }
        Insert: {
          created_at?: string
          episode?: number | null
          episode_name?: string | null
          id?: string
          is_alive?: boolean
          kind: string
          last_checked_at?: string
          season?: number | null
          source_url: string
          stream_url: string
          thumbnail?: string | null
          title: string
          year?: number | null
        }
        Update: {
          created_at?: string
          episode?: number | null
          episode_name?: string | null
          id?: string
          is_alive?: boolean
          kind?: string
          last_checked_at?: string
          season?: number | null
          source_url?: string
          stream_url?: string
          thumbnail?: string | null
          title?: string
          year?: number | null
        }
        Relationships: []
      }
      pool_sites: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          label: string
          last_crawled_at: string | null
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          label: string
          last_crawled_at?: string | null
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          label?: string
          last_crawled_at?: string | null
          url?: string
        }
        Relationships: []
      }
      proxies: {
        Row: {
          active: boolean
          ban_count: number
          country: string | null
          created_at: string
          fail_count: number
          id: string
          kind: string
          label: string
          last_used_at: string | null
          success_count: number
          template: string
        }
        Insert: {
          active?: boolean
          ban_count?: number
          country?: string | null
          created_at?: string
          fail_count?: number
          id?: string
          kind?: string
          label: string
          last_used_at?: string | null
          success_count?: number
          template: string
        }
        Update: {
          active?: boolean
          ban_count?: number
          country?: string | null
          created_at?: string
          fail_count?: number
          id?: string
          kind?: string
          label?: string
          last_used_at?: string | null
          success_count?: number
          template?: string
        }
        Relationships: []
      }
      scraper_logs: {
        Row: {
          created_at: string
          id: number
          level: string
          message: string
          meta: Json | null
          phase: string
        }
        Insert: {
          created_at?: string
          id?: number
          level?: string
          message: string
          meta?: Json | null
          phase: string
        }
        Update: {
          created_at?: string
          id?: number
          level?: string
          message?: string
          meta?: Json | null
          phase?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          active: boolean
          created_at: string
          events: string[]
          id: string
          kind: string
          last_status: number | null
          name: string
          telegram_chat_id: string | null
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          kind?: string
          last_status?: number | null
          name: string
          telegram_chat_id?: string | null
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          kind?: string
          last_status?: number | null
          name?: string
          telegram_chat_id?: string | null
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      api_hit: { Args: { _client: string; _limit: number }; Returns: boolean }
      claim_first_admin: { Args: never; Returns: boolean }
      claim_jobs: {
        Args: { _n: number }
        Returns: {
          attempts: number
          created_at: string
          depth: number
          error: string | null
          finished_at: string | null
          id: string
          locked_at: string | null
          referer: string | null
          status: string
          url: string
        }[]
        SetofOptions: {
          from: "*"
          to: "crawl_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
