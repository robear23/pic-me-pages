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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      book_generation_jobs: {
        Row: {
          book_id: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          generation_data: Json
          id: string
          progress: Json | null
          started_at: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          book_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          generation_data: Json
          id?: string
          progress?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          book_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          generation_data?: Json
          id?: string
          progress?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_generation_jobs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          art_style: string | null
          back_cover_image_url: string | null
          character_name: string
          complexity: string | null
          consistent_characters: boolean | null
          cover_image_url: string | null
          cover_url: string | null
          created_at: string | null
          id: string
          interests: string[]
          last_cover_attempt_at: string | null
          missing_components: string[] | null
          missing_covers: boolean | null
          pages: Json | null
          pdf_url: string | null
          photo_urls: string[]
          reworked_page_numbers: number[] | null
          selected_binding_type: string | null
          selected_page_count: number | null
          selected_pod_package_id: string | null
          selected_price: number | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          art_style?: string | null
          back_cover_image_url?: string | null
          character_name: string
          complexity?: string | null
          consistent_characters?: boolean | null
          cover_image_url?: string | null
          cover_url?: string | null
          created_at?: string | null
          id?: string
          interests: string[]
          last_cover_attempt_at?: string | null
          missing_components?: string[] | null
          missing_covers?: boolean | null
          pages?: Json | null
          pdf_url?: string | null
          photo_urls: string[]
          reworked_page_numbers?: number[] | null
          selected_binding_type?: string | null
          selected_page_count?: number | null
          selected_pod_package_id?: string | null
          selected_price?: number | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          art_style?: string | null
          back_cover_image_url?: string | null
          character_name?: string
          complexity?: string | null
          consistent_characters?: boolean | null
          cover_image_url?: string | null
          cover_url?: string | null
          created_at?: string | null
          id?: string
          interests?: string[]
          last_cover_attempt_at?: string | null
          missing_components?: string[] | null
          missing_covers?: boolean | null
          pages?: Json | null
          pdf_url?: string | null
          photo_urls?: string[]
          reworked_page_numbers?: number[] | null
          selected_binding_type?: string | null
          selected_page_count?: number | null
          selected_pod_package_id?: string | null
          selected_price?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          accent_color: string
          content: Json
          created_at: string | null
          description: string
          display_name: string
          id: string
          is_published: boolean
          last_edited_at: string | null
          last_published_at: string | null
          primary_color: string
          template_name: string
          updated_at: string | null
          version_history: Json
        }
        Insert: {
          accent_color?: string
          content?: Json
          created_at?: string | null
          description: string
          display_name: string
          id?: string
          is_published?: boolean
          last_edited_at?: string | null
          last_published_at?: string | null
          primary_color?: string
          template_name: string
          updated_at?: string | null
          version_history?: Json
        }
        Update: {
          accent_color?: string
          content?: Json
          created_at?: string | null
          description?: string
          display_name?: string
          id?: string
          is_published?: boolean
          last_edited_at?: string | null
          last_published_at?: string | null
          primary_color?: string
          template_name?: string
          updated_at?: string | null
          version_history?: Json
        }
        Relationships: []
      }
      orders: {
        Row: {
          book_id: string | null
          created_at: string | null
          id: string
          lulu_order_id: string | null
          order_type: string
          price_paid: number
          shipping_address: Json | null
          status: string | null
          stripe_payment_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          book_id?: string | null
          created_at?: string | null
          id?: string
          lulu_order_id?: string | null
          order_type: string
          price_paid: number
          shipping_address?: Json | null
          status?: string | null
          stripe_payment_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          book_id?: string | null
          created_at?: string | null
          id?: string
          lulu_order_id?: string | null
          order_type?: string
          price_paid?: number
          shipping_address?: Json | null
          status?: string | null
          stripe_payment_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      retry_credits: {
        Row: {
          book_id: string | null
          created_by: string | null
          granted_at: string | null
          id: string
          reason: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          book_id?: string | null
          created_by?: string | null
          granted_at?: string | null
          id?: string
          reason: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          book_id?: string | null
          created_by?: string | null
          granted_at?: string | null
          id?: string
          reason?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retry_credits_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          child_age: number | null
          email: string
          id: string
          name: string
          signed_up_at: string | null
        }
        Insert: {
          child_age?: number | null
          email: string
          id?: string
          name: string
          signed_up_at?: string | null
        }
        Update: {
          child_age?: number | null
          email?: string
          id?: string
          name?: string
          signed_up_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_stale_book_generation_jobs: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
