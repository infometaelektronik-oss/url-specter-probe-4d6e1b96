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
      autonomous_streams: {
        Row: {
          category: string | null
          choicely_id: string | null
          created_at: string
          custom_headers: Json | null
          failover_group: string | null
          failure_count: number
          id: string
          is_active: boolean
          last_checked_at: string | null
          last_pushed_at: string | null
          normalized_title: string | null
          poster_image_url: string | null
          resolution: string | null
          source: string | null
          source_website: string | null
          status: string
          stream_url: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          choicely_id?: string | null
          created_at?: string
          custom_headers?: Json | null
          failover_group?: string | null
          failure_count?: number
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_pushed_at?: string | null
          normalized_title?: string | null
          poster_image_url?: string | null
          resolution?: string | null
          source?: string | null
          source_website?: string | null
          status?: string
          stream_url: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          choicely_id?: string | null
          created_at?: string
          custom_headers?: Json | null
          failover_group?: string | null
          failure_count?: number
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_pushed_at?: string | null
          normalized_title?: string | null
          poster_image_url?: string | null
          resolution?: string | null
          source?: string | null
          source_website?: string | null
          status?: string
          stream_url?: string
          title?: string
          type?: string
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
