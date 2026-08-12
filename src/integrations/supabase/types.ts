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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          brief: string
          created_at: string
          finished_at: string | null
          html_template: string
          id: string
          mode: string
          name: string
          recipients: Json
          results: Json
          reviews: Json
          sender_email: string
          sender_name: string
          sent_count: number
          started_at: string | null
          status: string
          subject: string
          total_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          brief?: string
          created_at?: string
          finished_at?: string | null
          html_template?: string
          id?: string
          mode?: string
          name?: string
          recipients?: Json
          results?: Json
          reviews?: Json
          sender_email?: string
          sender_name?: string
          sent_count?: number
          started_at?: string | null
          status?: string
          subject?: string
          total_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          brief?: string
          created_at?: string
          finished_at?: string | null
          html_template?: string
          id?: string
          mode?: string
          name?: string
          recipients?: Json
          results?: Json
          reviews?: Json
          sender_email?: string
          sender_name?: string
          sent_count?: number
          started_at?: string | null
          status?: string
          subject?: string
          total_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      csv_row_events: {
        Row: {
          created_at: string
          csv_row_id: string
          error_message: string | null
          from_status: Database["public"]["Enums"]["csv_row_status"] | null
          id: string
          is_personalized: boolean | null
          research_ok: boolean | null
          research_sources_count: number | null
          run_id: string | null
          site_ok: boolean | null
          site_reason: string | null
          to_status: Database["public"]["Enums"]["csv_row_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          csv_row_id: string
          error_message?: string | null
          from_status?: Database["public"]["Enums"]["csv_row_status"] | null
          id?: string
          is_personalized?: boolean | null
          research_ok?: boolean | null
          research_sources_count?: number | null
          run_id?: string | null
          site_ok?: boolean | null
          site_reason?: string | null
          to_status: Database["public"]["Enums"]["csv_row_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          csv_row_id?: string
          error_message?: string | null
          from_status?: Database["public"]["Enums"]["csv_row_status"] | null
          id?: string
          is_personalized?: boolean | null
          research_ok?: boolean | null
          research_sources_count?: number | null
          run_id?: string | null
          site_ok?: boolean | null
          site_reason?: string | null
          to_status?: Database["public"]["Enums"]["csv_row_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "csv_row_events_csv_row_id_fkey"
            columns: ["csv_row_id"]
            isOneToOne: false
            referencedRelation: "csv_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      csv_rows: {
        Row: {
          approved: boolean
          categoria: string
          created_at: string
          email: string
          error_message: string | null
          generated_email: string | null
          id: string
          is_personalized: boolean
          nome: string
          research: Json | null
          research_sources: Json
          site_content: string | null
          status: Database["public"]["Enums"]["csv_row_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved?: boolean
          categoria?: string
          created_at?: string
          email: string
          error_message?: string | null
          generated_email?: string | null
          id?: string
          is_personalized?: boolean
          nome?: string
          research?: Json | null
          research_sources?: Json
          site_content?: string | null
          status?: Database["public"]["Enums"]["csv_row_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved?: boolean
          categoria?: string
          created_at?: string
          email?: string
          error_message?: string | null
          generated_email?: string | null
          id?: string
          is_personalized?: boolean
          nome?: string
          research?: Json | null
          research_sources?: Json
          site_content?: string | null
          status?: Database["public"]["Enums"]["csv_row_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          email: string
          id: string
          message_id: string | null
          reason: string | null
          sent_at: string
          status: Database["public"]["Enums"]["email_event_status"]
          updated_at: string
          updated_status_at: string | null
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          email: string
          id?: string
          message_id?: string | null
          reason?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["email_event_status"]
          updated_at?: string
          updated_status_at?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          email?: string
          id?: string
          message_id?: string | null
          reason?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["email_event_status"]
          updated_at?: string
          updated_status_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressions: {
        Row: {
          created_at: string
          detail: string | null
          email: string
          id: string
          reason: Database["public"]["Enums"]["suppression_reason"]
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          email: string
          id?: string
          reason?: Database["public"]["Enums"]["suppression_reason"]
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          email?: string
          id?: string
          reason?: Database["public"]["Enums"]["suppression_reason"]
          source?: string
          updated_at?: string
          user_id?: string
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
      csv_row_status: "pendente" | "processando" | "gerado" | "erro"
      email_event_status:
        | "enviado"
        | "entregue"
        | "bounce_hard"
        | "bounce_soft"
        | "spam"
        | "bloqueado"
        | "invalido"
        | "erro"
      suppression_reason: "bounce" | "spam" | "invalido" | "manual"
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
      csv_row_status: ["pendente", "processando", "gerado", "erro"],
      email_event_status: [
        "enviado",
        "entregue",
        "bounce_hard",
        "bounce_soft",
        "spam",
        "bloqueado",
        "invalido",
        "erro",
      ],
      suppression_reason: ["bounce", "spam", "invalido", "manual"],
    },
  },
} as const
