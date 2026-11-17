provider "aws" {
  region = var.region

  default_tags {
    tags = {
      App = local.app
    }
  }
}
