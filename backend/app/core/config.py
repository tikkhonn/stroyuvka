from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://asmrlsp:asmrlsp_dev@localhost:5432/asmrlsp"
    secret_key: str = "dev-secret-key-change-in-production"
    access_token_expire_minutes: int = 480
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    seed_demo_data: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
