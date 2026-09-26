export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      floor_map_revisions: {
        Row: {
          created_at: string
          height_px: number
          id: string
          owner_id: string
          photo_path: string
          retired_at: string | null
          width_px: number
        }
        Insert: {
          created_at?: string
          height_px: number
          id?: string
          owner_id: string
          photo_path: string
          retired_at?: string | null
          width_px: number
        }
        Update: {
          created_at?: string
          height_px?: number
          id?: string
          owner_id?: string
          photo_path?: string
          retired_at?: string | null
          width_px?: number
        }
        Relationships: [
          {
            foreignKeyName: "floor_map_revisions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "wardrobes"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      items: {
        Row: {
          archived_at: string | null
          created_at: string
          cutout_path: string | null
          display_name: string | null
          id: string
          note: string | null
          owner_id: string
          photo_path: string
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          cutout_path?: string | null
          display_name?: string | null
          id: string
          note?: string | null
          owner_id: string
          photo_path: string
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          cutout_path?: string | null
          display_name?: string | null
          id?: string
          note?: string | null
          owner_id?: string
          photo_path?: string
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "wardrobes"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "items_zone_fk"
            columns: ["zone_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      tier_events: {
        Row: {
          created_at: string
          id: string
          item_id: string
          note: string | null
          owner_id: string
          tier: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          note?: string | null
          owner_id?: string
          tier: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          note?: string | null
          owner_id?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_events_item_fk"
            columns: ["item_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "item_catalog"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "tier_events_item_fk"
            columns: ["item_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      wardrobes: {
        Row: {
          created_at: string
          is_public: boolean
          owner_id: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_public?: boolean
          owner_id: string
          slug: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_public?: boolean
          owner_id?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          created_at: string
          h: number | null
          id: string
          map_revision_id: string | null
          name: string
          owner_id: string
          sort_order: number
          updated_at: string
          w: number | null
          x: number | null
          y: number | null
        }
        Insert: {
          created_at?: string
          h?: number | null
          id?: string
          map_revision_id?: string | null
          name: string
          owner_id: string
          sort_order?: number
          updated_at?: string
          w?: number | null
          x?: number | null
          y?: number | null
        }
        Update: {
          created_at?: string
          h?: number | null
          id?: string
          map_revision_id?: string | null
          name?: string
          owner_id?: string
          sort_order?: number
          updated_at?: string
          w?: number | null
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zones_map_revision_fk"
            columns: ["map_revision_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "floor_map_revisions"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "zones_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "wardrobes"
            referencedColumns: ["owner_id"]
          },
        ]
      }
    }
    Views: {
      item_catalog: {
        Row: {
          archived_at: string | null
          created_at: string | null
          current_tier: string | null
          cutout_path: string | null
          display_name: string | null
          id: string | null
          note: string | null
          owner_id: string | null
          photo_path: string | null
          tier_event_id: string | null
          tiered_at: string | null
          zone_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "wardrobes"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "items_zone_fk"
            columns: ["zone_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      item_current_tiers: {
        Row: {
          created_at: string | null
          item_id: string | null
          note: string | null
          owner_id: string | null
          tier: string | null
          tier_event_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tier_events_item_fk"
            columns: ["item_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "item_catalog"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "tier_events_item_fk"
            columns: ["item_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

