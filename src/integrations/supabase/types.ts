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
      brains: {
        Row: {
          id: string
          prompt_content: string
          report_type: Database["public"]["Enums"]["report_type"]
          updated_at: string
          version: number
        }
        Insert: {
          id?: string
          prompt_content: string
          report_type: Database["public"]["Enums"]["report_type"]
          updated_at?: string
          version?: number
        }
        Update: {
          id?: string
          prompt_content?: string
          report_type?: Database["public"]["Enums"]["report_type"]
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      items: {
        Row: {
          check_in_comment: string | null
          check_out_comment: string | null
          condition: string | null
          created_at: string
          description: string | null
          edited: boolean
          id: string
          item_name: string | null
          photo_url: string | null
          report_id: string
          room_id: string | null
          source: Database["public"]["Enums"]["item_source"]
          update_comment: string | null
        }
        Insert: {
          check_in_comment?: string | null
          check_out_comment?: string | null
          condition?: string | null
          created_at?: string
          description?: string | null
          edited?: boolean
          id?: string
          item_name?: string | null
          photo_url?: string | null
          report_id: string
          room_id?: string | null
          source?: Database["public"]["Enums"]["item_source"]
          update_comment?: string | null
        }
        Update: {
          check_in_comment?: string | null
          check_out_comment?: string | null
          condition?: string | null
          created_at?: string
          description?: string | null
          edited?: boolean
          id?: string
          item_name?: string | null
          photo_url?: string | null
          report_id?: string
          room_id?: string | null
          source?: Database["public"]["Enums"]["item_source"]
          update_comment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string
          client_name: string | null
          created_at: string
          exterior_photo_url: string | null
          id: string
          postcode: string
          status: Database["public"]["Enums"]["property_status"]
          user_id: string
        }
        Insert: {
          address: string
          client_name?: string | null
          created_at?: string
          exterior_photo_url?: string | null
          id?: string
          postcode: string
          status?: Database["public"]["Enums"]["property_status"]
          user_id: string
        }
        Update: {
          address?: string
          client_name?: string | null
          created_at?: string
          exterior_photo_url?: string | null
          id?: string
          postcode?: string
          status?: Database["public"]["Enums"]["property_status"]
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          docx_path: string | null
          id: string
          pdf_path: string | null
          previous_report_id: string | null
          property_id: string
          report_type: Database["public"]["Enums"]["report_type"]
          share_token: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          created_at?: string
          docx_path?: string | null
          id?: string
          pdf_path?: string | null
          previous_report_id?: string | null
          property_id: string
          report_type: Database["public"]["Enums"]["report_type"]
          share_token?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          created_at?: string
          docx_path?: string | null
          id?: string
          pdf_path?: string | null
          previous_report_id?: string | null
          property_id?: string
          report_type?: Database["public"]["Enums"]["report_type"]
          share_token?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_previous_report_id_fkey"
            columns: ["previous_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          id: string
          name: string
          report_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          report_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          report_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "rooms_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      wide_shots: {
        Row: {
          created_at: string
          id: string
          photo_url: string
          room_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          photo_url: string
          room_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          photo_url?: string
          room_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "wide_shots_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      item_source: "ai" | "manual"
      property_status:
        | "Inventory Pending"
        | "Awaiting Check In"
        | "In Tenancy"
        | "Check Out Booked"
        | "Check Out Complete"
      report_status: "draft" | "complete"
      report_type: "Inventory" | "Check In" | "Check Out" | "Update"
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
    Enums: {
      item_source: ["ai", "manual"],
      property_status: [
        "Inventory Pending",
        "Awaiting Check In",
        "In Tenancy",
        "Check Out Booked",
        "Check Out Complete",
      ],
      report_status: ["draft", "complete"],
      report_type: ["Inventory", "Check In", "Check Out", "Update"],
    },
  },
} as const
